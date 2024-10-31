import { Suspense } from 'react'
import dynamic from 'next/dynamic'
import { notFound } from 'next/navigation'

import type { KanbanContainerData, KanbanTask } from '~/core/structures'
import Kanban from '~/components/kanban/kanban'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import Loading from '~/components/ui/loading'

import { get_request_details } from '~/server/db/query'

export default function CommissionDetailsPage(props: {
    params: { slug: string; order_id: string }
}) {
    return (
        <div className="container mx-auto flex flex-col gap-5 px-5">
            <div className="flex flex-col justify-center gap-4">
                <h1 className="text-3xl font-bold">
                    Request for {props.params.order_id}
                </h1>
                <h2 className="text-lg italic text-base-content/80">
                    Commissioned on date
                </h2>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Order Details</CardTitle>
                </CardHeader>
                <CardContent>Details about the order</CardContent>
            </Card>
            <Suspense fallback={<Loading />}>
                <CommissionTabs order_id={props.params.order_id} />
            </Suspense>
        </div>
    )
}

async function CommissionTabs(props: { order_id: string }) {
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
                    <KanbanView
                        containers={
                            request_data.kanban.containers as KanbanContainerData[]
                        }
                        tasks={request_data.kanban.tasks as KanbanTask[]}
                        id={request_data.kanban?.id}
                    />
                </Suspense>
            </TabsContent>
            <TabsContent value="messages">messages</TabsContent>
            <TabsContent value="invoice">invoice</TabsContent>
            <TabsContent value="delivery">delivery</TabsContent>
        </Tabs>
    )
}

async function KanbanView(props: {
    containers: KanbanContainerData[]
    tasks: KanbanTask[]
    id: string
}) {
    return (
        <Kanban
            kanban_id={props.id}
            kanban_containers={props.containers}
            kanban_tasks={props.tasks}
        />
    )
}

// async function PageContent(props: { slug: string; order_id: string }) {
//     const request_data = await get_request_details(props.order_id)

//     if (!request_data) {
//         return notFound()
//     }

//     const request_columns: ColumnDef<{
//         item_label: string
//         item_value: string
//     }>[] = [
//         {
//             accessorKey: 'item_label',
//             header: 'Form Item'
//         },
//         {
//             accessorKey: 'item_value',
//             header: 'Response'
//         }
//     ]

//     if (!request_data.kanban) {
//         return null
//     }

//     return (
//         <main className="flex flex-col gap-5">
//             <h1 className="text-3xl font-bold">
//                 Request for {request_data.user.username ?? 'User'}
//             </h1>
//             <h2 className="text-lg italic text-base-content/80">
//                 Requested {new Date(request_data.created_at).toLocaleDateString()}
//             </h2>
//             <div className="divider"></div>
//             <div className="flex flex-col gap-5 rounded-xl bg-base-200 p-5">
//                 <div className="flex flex-col">
//                     <h2 className="text-xl font-bold">Order Details</h2>
//                     <span className="font-lg">
//                         Commission: {request_data.commission?.title}
//                     </span>
//                     <span className="font-md">Order ID: {request_data.order_id}</span>
//                 </div>
//                 <div className="divider"></div>
//                 <div className="flex flex-col gap-5">
//                     <DataTable
//                         columns={request_columns}
//                         data={Object.keys(request_data.content as RequestContent).map(
//                             (key) => ({
//                                 item_label: (request_data.content as RequestContent)[key]!
//                                     .label,
//                                 item_value: (request_data.content as RequestContent)[key]!
//                                     .value
//                             })
//                         )}
//                     />
//                 </div>
//             </div>
//             <Tabs defaultValue="kanban">
//                 <TabsList className="w-full justify-start bg-base-300">
//                     <TabsTrigger value="kanban">Kanban</TabsTrigger>
//                     <TabsTrigger value="messages">Messages</TabsTrigger>
//                     <TabsTrigger value="invoice">Invoice</TabsTrigger>
//                     <TabsTrigger value="delivery">Delivery</TabsTrigger>
//                 </TabsList>
//                 <TabsContent value="kanban">
//                     <Kanban
//                         kanban_containers={
//                             request_data.kanban.containers as KanbanContainerData[]
//                         }
//                         kanban_tasks={(request_data.kanban.tasks as KanbanTask[]) || []}
//                         kanban_id={request_data.kanban.id}
//                     />
//                 </TabsContent>
//                 <TabsContent value="messages">
//                     <MessagesClient
//                         hide_channel_list
//                         channel_url={request_data.sendbird_channel_url ?? undefined}
//                     />
//                 </TabsContent>
//                 <TabsContent value="invoice">
//                     <div className="flex flex-col gap-5 p-5">
//                         <Suspense fallback={<Loading />}>
//                             <InvoiceView invoice={request_data.invoice} />
//                         </Suspense>
//                     </div>
//                 </TabsContent>
//                 <TabsContent value="delivery">
//                     <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
//                         <Card className="col-span-2">
//                             <CardHeader>
//                                 <CardTitle>Delivery</CardTitle>
//                                 <CardDescription>
//                                     Upload your final product here
//                                 </CardDescription>
//                             </CardHeader>
//                             <CardContent>
//                                 <DownloadsDisplay
//                                     user_id={request_data.user.id}
//                                     request_id={request_data.id}
//                                     download_id={request_data.download_id}
//                                 />
//                                 <div className="divider">OR</div>
//                                 <DeliverForm
//                                     request_id={request_data.id}
//                                     user_id={request_data.user.id}
//                                     delivered={
//                                         (request_data.status as RequestStatus) ===
//                                         RequestStatus.Delivered
//                                     }
//                                 />
//                             </CardContent>
//                         </Card>
//                         <Card>
//                             <CardHeader>
//                                 <CardTitle className="flex items-center gap-3">
//                                     Status
//                                     <Badge
//                                         variant={
//                                             request_data.download_id
//                                                 ? 'success'
//                                                 : 'destructive'
//                                         }
//                                         className="badge-lg"
//                                     >
//                                         {request_data.download_id
//                                             ? 'Delivered'
//                                             : 'Not Delivered'}
//                                     </Badge>
//                                 </CardTitle>
//                             </CardHeader>
//                             <CardContent></CardContent>
//                         </Card>
//                     </div>
//                 </TabsContent>
//             </Tabs>
//         </main>
//     )
// }

// function DownloadsDisplay(props: {
//     download_id: string | null
//     user_id: string
//     request_id: string
// }) {
//     if (!props.download_id) {
//         return <DownloadsDropzone user_id={props.user_id} request_id={props.request_id} />
//     }

//     return (
//         <div className="flex flex-col gap-5 p-5">
//             <>Download has been submitted!</>
//         </div>
//     )
// }
