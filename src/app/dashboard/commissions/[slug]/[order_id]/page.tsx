import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { currentUser } from '@clerk/nextjs/server'

import type { KanbanContainerData, KanbanTask, RequestContent } from '~/core/structures'
import Kanban from '~/components/kanban/kanban'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import Loading from '~/components/ui/loading'

import { get_request_details } from '~/server/db/query'

import MessagesClient from '~/components/messages/messages'
import InvoiceDisplay from '~/components/dashboard/invoice'
import DownloadsDropzone from '~/components/dashboard/downloads-dropzone'

export default async function CommissionDetailsPage(props: {
    params: Promise<{ slug: string; order_id: string }>
}) {
    const params = await props.params

    return (
        <div className="container mx-auto flex flex-col gap-5 px-5">
            <Suspense fallback={<Loading />}>
                <RequestHeader order_id={params.order_id} />
            </Suspense>

            <Suspense fallback={<Loading />}>
                <CommissionDetails order_id={params.order_id} />
            </Suspense>
            <Suspense fallback={<Loading />}>
                <CommissionTabs order_id={params.order_id} />
            </Suspense>
        </div>
    )
}

async function RequestHeader(props: { order_id: string }) {
    const request_data = await get_request_details(props.order_id)

    if (!request_data) {
        return notFound()
    }

    return (
        <div className="flex flex-col justify-center gap-4">
            <h1 className="text-3xl font-bold">
                Request for {request_data.user.username}
            </h1>
            <h2 className="text-lg italic text-base-content/80">
                Commissioned on {new Date(request_data.created_at).toLocaleDateString()}
            </h2>
        </div>
    )
}

async function CommissionDetails(props: { order_id: string }) {
    const request_data = await get_request_details(props.order_id)

    if (!request_data) {
        return notFound()
    }

    const request_content = request_data.content as RequestContent

    return (
        <Card>
            <CardHeader>
                <CardTitle>Order Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
                {Object.keys(request_content).map((key) => (
                    <div key={key} className="border-b-2 border-base-content/[0.1] pb-2">
                        <h3 className="text-lg font-bold">
                            {request_content[key]?.label}
                        </h3>
                        <p>{request_content[key]?.value}</p>
                    </div>
                ))}
            </CardContent>
        </Card>
    )
}

async function CommissionTabs(props: { order_id: string }) {
    const user = await currentUser()

    if (!user) {
        return redirect('/u/login')
    }

    const request_data = await get_request_details(props.order_id)

    if (!request_data?.kanban) {
        return notFound()
    }

    return (
        <Tabs defaultValue="kanban">
            <TabsList className="w-full justify-start bg-base-200">
                <TabsTrigger value="kanban">Kanban</TabsTrigger>
                <TabsTrigger value="messages">Messages</TabsTrigger>
                <TabsTrigger value="invoice">Invoice</TabsTrigger>
                <TabsTrigger value="delivery">Delivery</TabsTrigger>
            </TabsList>
            <TabsContent value="kanban">
                <Suspense fallback={<Loading />}>
                    <Kanban
                        kanban_id={request_data.kanban.id}
                        kanban_containers={
                            request_data.kanban.containers as KanbanContainerData[]
                        }
                        kanban_tasks={request_data.kanban.tasks as KanbanTask[]}
                    />
                </Suspense>
            </TabsContent>
            <TabsContent value="messages">
                <MessagesClient
                    channel_url={request_data.sendbird_channel_url ?? undefined}
                    hide={true}
                    user_id={user?.id}
                />
            </TabsContent>
            <TabsContent value="invoice">
                <InvoiceDisplay invoice={request_data.invoice} />
            </TabsContent>
            <TabsContent value="delivery">
                <DownloadsDisplay
                    user_id={request_data.user.id}
                    request_id={request_data.id}
                    download_id={request_data.download_id}
                />
            </TabsContent>
        </Tabs>
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
