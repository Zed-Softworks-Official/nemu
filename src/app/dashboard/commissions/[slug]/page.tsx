import { notFound, redirect } from 'next/navigation'

import { api } from '~/trpc/server'

import DashboardContainer from '~/components/ui/dashboard-container'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import Link from 'next/link'
import { EyeIcon, MenuIcon, PencilIcon } from 'lucide-react'
import CommissionPublishButton from '~/components/dashboard/commission-publish'
import { ClientRequestData, RequestContent, RequestStatus } from '~/core/structures'
// import RequestCard from '~/components/dashboard/request-card'
import { currentUser } from '@clerk/nextjs/server'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger
} from '~/components/ui/dialog'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import NemuImage from '~/components/nemu-image'
import { Button } from '~/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger
} from '~/components/ui/dropdown-menu'
import RequestCardDropdown from '~/components/dashboard/request-card-dropdown'

export default async function CommissionDetailPage({
    params
}: {
    params: { slug: string }
}) {
    const user = await currentUser()

    const commission = await api.commission.get_commission_dashboard_details({
        handle: user?.publicMetadata.handle as string,
        slug: params.slug
    })

    if (!commission) {
        return notFound()
    }

    return (
        <main className="flex flex-col gap-5">
            <div className="flex flex-row items-center justify-between">
                <h1 className="text-3xl font-bold">{commission.title}</h1>
                <div className="flex gap-2">
                    <Button variant="outline" className="btn-outline">
                        <PencilIcon className="h-6 w-6" />
                        Edit Commission
                    </Button>
                    <CommissionPublishButton
                        id={commission.id!}
                        published={commission.published}
                    />
                </div>
            </div>
            <div className="divider"></div>
            <Tabs defaultValue="new_requests">
                <TabsList className="w-full justify-start rounded-xl shadow-xl bg-base-300">
                    <TabsTrigger value="new_requests">New</TabsTrigger>
                    <TabsTrigger value="active_requests">Active</TabsTrigger>
                    <TabsTrigger value="waitlisted_requests">Waitlisted</TabsTrigger>
                    <TabsTrigger value="delivered_requests">Delivered</TabsTrigger>
                </TabsList>
                <TabsContent value="new_requests">
                    <div className="card bg-base-200 shadow-xl">
                        <div className="card-body">
                            <h2 className="card-title">New Requests</h2>
                            <div className="divider"></div>
                            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                                {commission.requests
                                    ?.filter(
                                        (request) =>
                                            request.status === RequestStatus.Pending
                                    )
                                    .map((request) => (
                                        <RequestCard key={request.id} request={request} />
                                    ))}
                            </div>
                        </div>
                    </div>
                </TabsContent>
                <TabsContent value="active_requests">
                    <div className="card bg-base-200 shadow-xl">
                        <div className="card-body">
                            <h2 className="card-title">Active Requests</h2>
                            <div className="divider"></div>
                            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                                {commission.requests
                                    ?.filter(
                                        (request) =>
                                            request.status === RequestStatus.Accepted
                                    )
                                    .map((request) => (
                                        <RequestCard
                                            key={request.id}
                                            request={request}
                                            accepted_data={{
                                                accepted: true,
                                                slug: commission.slug
                                            }}
                                        />
                                    ))}
                            </div>
                        </div>
                    </div>
                </TabsContent>
                <TabsContent value="waitlisted_requests">
                    <div className="card bg-base-200 shadow-xl">
                        <div className="card-body">
                            <h2 className="card-title">Waitlisted Requests</h2>
                            <div className="divider"></div>
                        </div>
                    </div>
                </TabsContent>
                <TabsContent value="delivered_requests">
                    <div className="card bg-base-200 shadow-xl">
                        <div className="card-body">
                            <h2 className="card-title">Delivered Requests</h2>
                            <div className="divider"></div>
                        </div>
                    </div>
                </TabsContent>
            </Tabs>
        </main>
    )
    // <DashboardContainer
    //     title={commission.title}
    //     contentClassName="flex flex-col gap-5"
    // >
    //     <div className="flex flex-col gap-5 rounded-xl bg-base-200 p-5 shadow-xl">
    //         <h2 className="card-title">Commission Actions</h2>
    //         <div className="flex w-full flex-row justify-between gap-5">
    //             <div className="flex flex-row gap-5">
    //                 <Link
    //                     href={`/dashboard/commissions/${commission.slug}/update`}
    //                     className="btn btn-outline"
    //                 >
    //                     <PencilIcon className="h-6 w-6" />
    //                     Edit Commission
    //                 </Link>
    //                 <Link
    //                     href={`/dashboard/forms/${commission.form_id}`}
    //                     className="btn btn-outline"
    //                 >
    //                     <PencilIcon className="h-6 w-6" />
    //                     Edit Commission Form
    //                 </Link>
    //             </div>
    //             <CommissionPublishButton
    //                 id={commission.id!}
    //                 published={commission.published}
    //             />
    //         </div>
    //     </div>
    //     <div className="flex flex-col gap-5 rounded-xl bg-base-200 p-5 shadow-xl">
    //         <h2 className="card-title">Requests</h2>

    //     </div>
    // </DashboardContainer>
}

function RequestCard({
    request,
    accepted_data
}: {
    request: ClientRequestData
    accepted_data?: { accepted: boolean; slug: string }
}) {
    const request_data = request.content as RequestContent

    return (
        <Dialog>
            <div className="flex animate-pop-in flex-col rounded-xl bg-base-300 p-5 transition-all duration-200 ease-in-out">
                <div className="flex flex-col items-center justify-center gap-5">
                    <Avatar>
                        <AvatarImage
                            src={request.user.imageUrl}
                            alt="User Profile Photo"
                        />
                        <AvatarFallback>
                            <NemuImage
                                src={'/profile.png'}
                                alt="User Profile Photo"
                                width={20}
                                height={20}
                                priority
                            />
                        </AvatarFallback>
                    </Avatar>
                    <h3 className="card-title">
                        {request.user.username || request.user.firstName}
                    </h3>
                </div>
                <div className="divider-vertical"></div>
                <div className="flex flex-col gap-5">
                    <div className="flex flex-row gap-5">
                        <RequestCardViewButton
                            order_id={request.order_id}
                            accepted_data={accepted_data}
                        />
                    </div>
                </div>
            </div>
            <DialogContent>
                <DialogHeader className="flex flex-row items-center justify-between">
                    <div>
                        <DialogTitle>
                            Requst from {request.user.username || request.user.firstName}
                        </DialogTitle>
                        <DialogDescription>
                            <span className="italic text-base-content/60">
                                Requested:{' '}
                                <time>
                                    {new Date(request.created_at).toLocaleDateString()}
                                </time>
                            </span>
                        </DialogDescription>
                    </div>
                    <RequestCardDropdown request_id={request.id} />
                </DialogHeader>
                <div className="divider"></div>
                <div className="flex flex-col gap-5">
                    {Object.keys(request_data).map((key) => (
                        <div key={key} className="flex flex-col gap-5">
                            <div className="rounded-xl bg-base-100 p-5">
                                <h3 className="card-title">{request_data[key]?.label}</h3>
                                <p>{request_data[key]?.value}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    )
}

function RequestCardViewButton(props: {
    order_id: string
    accepted_data?: { accepted: boolean; slug: string }
}) {
    if (props.accepted_data) {
        return (
            <Link
                href={`/dashboard/commissions/${props.accepted_data.slug}/${props.order_id}`}
                className="btn btn-primary w-full text-white"
            >
                <EyeIcon className="h-6 w-6" />
                View Request
            </Link>
        )
    }

    return (
        <DialogTrigger asChild>
            <Button className="w-full">
                <EyeIcon className="h-6 w-6" />
                View Request
            </Button>
        </DialogTrigger>
    )
}
