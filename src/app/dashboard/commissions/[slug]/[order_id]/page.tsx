import { clerkClient } from '@clerk/nextjs/server'
import { notFound } from 'next/navigation'

import MessagesClient from '~/components/messages/messages'
import Kanban from '~/components/kanban/kanban'

import { api } from '~/trpc/server'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { KanbanContainerData, KanbanTask, RequestContent } from '~/core/structures'

import { UploadDropzone } from '~/components/files/uploadthing'

export default async function CommissionOrderDetailPage({
    params
}: {
    params: { slug: string; order_id: string }
}) {
    const request = await api.requests.get_request(params.order_id)

    if (!request) {
        return notFound()
    }

    const user = await clerkClient.users.getUser(request.user_id)
    const kanban = await api.kanban.get_kanban(request.id)
    const request_data = request.content as RequestContent

    if (!kanban) {
        return null
    }

    return (
        <main className="flex flex-col gap-5">
            <h1 className="text-3xl font-bold">
                Request for {user.username || user.firstName || 'User'}
            </h1>
            <h2 className="text-lg italic text-base-content/80">
                Requested {new Date(request.created_at).toLocaleDateString()}
            </h2>
            <div className="divider"></div>
            <div className="flex flex-col gap-5 rounded-xl bg-base-200 p-5">
                <div className="flex flex-col">
                    <h2 className="text-xl font-bold">Order Details</h2>
                    <span className="font-lg">
                        Commission: {request.commission.title}
                    </span>
                    <span className="font-md">Order ID: {request.order_id}</span>
                </div>
                <div className="divider"></div>
                <div className="flex flex-col gap-5">
                    {Object.keys(request_data).map((key) => (
                        <div key={key} className="flex flex-col gap-5">
                            <div className="rounded-xl bg-base-300 p-5">
                                <h3 className="card-title">{request_data[key]?.label}</h3>
                                <p>{request_data[key]?.value}</p>
                            </div>
                        </div>
                    ))}
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
                        kanban_containers={kanban.containers as KanbanContainerData[]}
                        kanban_tasks={(kanban.tasks as KanbanTask[]) || []}
                        kanban_id={kanban.id}
                    />
                </TabsContent>
                <TabsContent value="messages">
                    <MessagesClient
                        hide_channel_list
                        channel_url={request.sendbird_channel_url!}
                    />
                </TabsContent>
                <TabsContent value="downloads">
                    <div className="flex flex-col gap-5 p-5">
                        <h2 className="card-title">Downloads</h2>
                        <UploadDropzone endpoint="commissionDownloadUploader" />
                    </div>
                </TabsContent>
            </Tabs>
        </main>
    )
}
