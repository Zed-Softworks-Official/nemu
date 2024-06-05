import { clerkClient } from '@clerk/nextjs/server'
import { notFound } from 'next/navigation'

import MessagesClient from '~/components/messages/messages'
import Kanban from '~/components/kanban/kanban'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import {
    KanbanContainerData,
    KanbanTask,
    RequestContent,
    RequestStatus
} from '~/core/structures'
import DownloadsDropzone from '~/components/dashboard/downloads-dropzone'
import DataTable from '~/components/data-table'
import { ColumnDef } from '@tanstack/react-table'
import { unstable_cache } from 'next/cache'
import { db } from '~/server/db'
import { invoices, kanbans, requests } from '~/server/db/schema'
import { eq } from 'drizzle-orm'
import { Suspense } from 'react'
import Loading from '~/components/ui/loading'
import InvoiceEditor from '~/components/dashboard/invoice-editor'

import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from '~/components/ui/card'
import { Badge } from '~/components/ui/badge'
import DeliverForm from '~/components/dashboard/deliver-form'

const get_request_data = unstable_cache(
    async (order_id: string) => {
        const request = await db.query.requests.findFirst({
            where: eq(requests.order_id, order_id),
            with: {
                user: true,
                commission: true
            }
        })

        if (!request) {
            return undefined
        }

        const kanban = await db.query.kanbans.findFirst({
            where: eq(kanbans.request_id, request.id)
        })

        if (!kanban) {
            return undefined
        }

        return {
            request: {
                id: request.id,
                invoice_id: request.invoice_id,
                content: request.content as RequestContent,
                created_at: request.created_at,
                commission_id: request.commission_id,
                order_id: request.order_id,
                sendbird_channel_url: request.sendbird_channel_url,
                download_id: request.download_id,
                commission: {
                    title: request.commission.title
                },
                status: request.status
            },
            user: await clerkClient.users.getUser(request.user_id),
            kanban
        }
    },
    ['request-data'],
    {
        revalidate: 60
    }
)

const get_invoice_data = unstable_cache(
    async (invoice_id: string) => {
        const invoice = await db.query.invoices.findFirst({
            where: eq(invoices.id, invoice_id),
            with: {
                invoice_items: true
            }
        })

        if (!invoice) {
            return undefined
        }

        return invoice
    },
    ['request-invoice-data']
)

export default async function CommissionOrderDetailPage({
    params
}: {
    params: { slug: string; order_id: string }
}) {
    const request_data = await get_request_data(params.order_id)

    if (!request_data) {
        return notFound()
    }

    const request_columns: ColumnDef<{
        item_label: string
        item_value: string
    }>[] = [
        {
            accessorKey: 'item_label',
            header: 'Form Item'
        },
        {
            accessorKey: 'item_value',
            header: 'Response'
        }
    ]

    if (!request_data.kanban) {
        return null
    }

    return (
        <main className="flex flex-col gap-5">
            <h1 className="text-3xl font-bold">
                Request for{' '}
                {request_data.user.username || request_data.user.firstName || 'User'}
            </h1>
            <h2 className="text-lg italic text-base-content/80">
                Requested {new Date(request_data.request.created_at).toLocaleDateString()}
            </h2>
            <div className="divider"></div>
            <div className="flex flex-col gap-5 rounded-xl bg-base-200 p-5">
                <div className="flex flex-col">
                    <h2 className="text-xl font-bold">Order Details</h2>
                    <span className="font-lg">
                        Commission: {request_data.request.commission.title}
                    </span>
                    <span className="font-md">
                        Order ID: {request_data.request.order_id}
                    </span>
                </div>
                <div className="divider"></div>
                <div className="flex flex-col gap-5">
                    <DataTable
                        columns={request_columns}
                        data={Object.keys(request_data.request.content).map((key) => ({
                            item_label: request_data.request.content[key]?.label!,
                            item_value: request_data.request.content[key]?.value!
                        }))}
                    />
                </div>
            </div>
            <Tabs defaultValue="kanban">
                <TabsList className="w-full justify-start bg-base-300">
                    <TabsTrigger value="kanban">Kanban</TabsTrigger>
                    <TabsTrigger value="messages">Messages</TabsTrigger>
                    <TabsTrigger value="invoice">Invoice</TabsTrigger>
                    <TabsTrigger value="delivery">Delivery</TabsTrigger>
                </TabsList>
                <TabsContent value="kanban">
                    <Kanban
                        kanban_containers={
                            request_data.kanban.containers as KanbanContainerData[]
                        }
                        kanban_tasks={(request_data.kanban.tasks as KanbanTask[]) || []}
                        kanban_id={request_data.kanban.id}
                    />
                </TabsContent>
                <TabsContent value="messages">
                    <MessagesClient
                        hide_channel_list
                        channel_url={request_data.request.sendbird_channel_url!}
                    />
                </TabsContent>
                <TabsContent value="invoice">
                    <div className="flex flex-col gap-5 p-5">
                        <Suspense fallback={<Loading />}>
                            <InvoiceDisplay
                                invoice_id={request_data.request.invoice_id}
                            />
                        </Suspense>
                    </div>
                </TabsContent>
                <TabsContent value="delivery">
                    <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                        <Card className="col-span-2">
                            <CardHeader>
                                <CardTitle>Delivery</CardTitle>
                                <CardDescription>
                                    Upload your final product here
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <DownloadsDisplay
                                    user_id={request_data.user.id}
                                    request_id={request_data.request.id}
                                    download_id={request_data.request.download_id}
                                />
                                <div className="divider">OR</div>
                                <DeliverForm
                                    request_id={request_data.request.id}
                                    user_id={request_data.user.id}
                                    delivered={
                                        request_data.request.status ===
                                        RequestStatus.Delivered
                                    }
                                />
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-3">
                                    Status
                                    <Badge
                                        variant={
                                            request_data.request.download_id
                                                ? 'success'
                                                : 'destructive'
                                        }
                                        className="badge-lg"
                                    >
                                        {request_data.request.download_id
                                            ? 'Delivered'
                                            : 'Not Delivered'}
                                    </Badge>
                                </CardTitle>
                            </CardHeader>
                            <CardContent></CardContent>
                        </Card>
                    </div>
                </TabsContent>
            </Tabs>
        </main>
    )
}

function DownloadsDisplay(props: {
    download_id: string | null
    user_id: string
    request_id: string
}) {
    if (!props.download_id) {
        return <DownloadsDropzone user_id={props.user_id} request_id={props.request_id} />
    }

    return (
        <div className="flex flex-col gap-5 p-5">
            <>Download has been submitted!</>
        </div>
    )
}

async function InvoiceDisplay(props: { invoice_id: string | null }) {
    if (!props.invoice_id) {
        return null
    }

    const invoice = await get_invoice_data(props.invoice_id)

    if (!invoice) {
        return null
    }

    return <InvoiceEditor invoice={invoice} />
}
