import { clerkClient } from '@clerk/nextjs/server'
import { notFound } from 'next/navigation'

import MessagesClient from '~/components/messages/messages'
import Kanban from '~/components/kanban/kanban'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { KanbanContainerData, KanbanTask, RequestContent } from '~/core/structures'
import DownloadsDropzone from '~/components/dashboard/downloads-dropzone'
import DataTable from '~/components/data-table'
import { ColumnDef } from '@tanstack/react-table'
import { unstable_cache } from 'next/cache'
import { db } from '~/server/db'
import { kanbans, requests } from '~/server/db/schema'
import { eq } from 'drizzle-orm'

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
                content: request.content as RequestContent,
                created_at: request.created_at,
                commission_id: request.commission_id,
                order_id: request.order_id,
                sendbird_channel_url: request.sendbird_channel_url,
                download_id: request.download_id,
                commission: {
                    title: request.commission.title
                }
            },
            user: await clerkClient.users.getUser(request.user_id),
            kanban
        }
    },
    ['request-data']
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
                    <TabsTrigger value="downloads">Downloads</TabsTrigger>
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
                <TabsContent value="downloads">
                    <div className="flex flex-col gap-5 p-5">
                        <DownloadsDisplay
                            user_id={request_data.user.id}
                            request_id={request_data.request.id}
                            download_id={request_data.request.download_id}
                        />
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
