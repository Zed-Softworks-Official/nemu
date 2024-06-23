import { notFound } from 'next/navigation'

import MessagesClient from '~/components/messages/messages'
import Kanban from '~/components/kanban/kanban'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import {
    type KanbanContainerData,
    type KanbanTask,
    type RequestContent,
    RequestStatus
} from '~/core/structures'
import DownloadsDropzone from '~/components/dashboard/downloads-dropzone'
import DataTable from '~/components/data-table'
import type { ColumnDef } from '@tanstack/react-table'
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
import { get_request_details } from '~/server/db/query'
import type { InferSelectModel } from 'drizzle-orm'
import type { invoice_items, invoices } from '~/server/db/schema'

export default function CommissionDetailsPage({
    params
}: {
    params: { slug: string; order_id: string }
}) {
    return (
        <Suspense fallback={<Loading />}>
            <PageContent slug={params.slug} order_id={params.order_id} />
        </Suspense>
    )
}

async function PageContent(props: { slug: string; order_id: string }) {
    const request_data = await get_request_details(props.order_id)

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
                {request_data.user.username ?? request_data.user.firstName ?? 'User'}
            </h1>
            <h2 className="text-lg italic text-base-content/80">
                Requested {new Date(request_data.created_at).toLocaleDateString()}
            </h2>
            <div className="divider"></div>
            <div className="flex flex-col gap-5 rounded-xl bg-base-200 p-5">
                <div className="flex flex-col">
                    <h2 className="text-xl font-bold">Order Details</h2>
                    <span className="font-lg">
                        Commission: {request_data.commission?.title}
                    </span>
                    <span className="font-md">Order ID: {request_data.order_id}</span>
                </div>
                <div className="divider"></div>
                <div className="flex flex-col gap-5">
                    <DataTable
                        columns={request_columns}
                        data={Object.keys(request_data.content as RequestContent).map(
                            (key) => ({
                                item_label: (request_data.content as RequestContent)[key]!
                                    .label,
                                item_value: (request_data.content as RequestContent)[key]!
                                    .value
                            })
                        )}
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
                        channel_url={request_data.sendbird_channel_url!}
                    />
                </TabsContent>
                <TabsContent value="invoice">
                    <div className="flex flex-col gap-5 p-5">
                        <Suspense fallback={<Loading />}>
                            <InvoiceDisplay invoice={request_data.invoice} />
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
                                    request_id={request_data.id}
                                    download_id={request_data.download_id}
                                />
                                <div className="divider">OR</div>
                                <DeliverForm
                                    request_id={request_data.id}
                                    user_id={request_data.user.id}
                                    delivered={
                                        (request_data.status as RequestStatus) ===
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
                                            request_data.download_id
                                                ? 'success'
                                                : 'destructive'
                                        }
                                        className="badge-lg"
                                    >
                                        {request_data.download_id
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

async function InvoiceDisplay(props: {
    invoice?: InferSelectModel<typeof invoices> & {
        invoice_items: InferSelectModel<typeof invoice_items>[]
    }
}) {
    if (!props.invoice) {
        return null
    }

    return <InvoiceEditor invoice={props.invoice} />
}
