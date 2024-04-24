import { notFound, redirect } from 'next/navigation'

import { api } from '~/trpc/server'
import { getServerAuthSession } from '~/server/auth'

import DashboardContainer from '~/components/ui/dashboard-container'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import Link from 'next/link'
import { PencilIcon } from 'lucide-react'
import CommissionPublishButton from '~/components/dashboard/commission-publish'
import { RequestStatus } from '~/core/structures'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import NemuImage from '~/components/nemu-image'

export default async function CommissionDetailPage({
    params
}: {
    params: { slug: string }
}) {
    const session = await getServerAuthSession()
    if (!session || !session.user.artist_id || !session.user.handle) {
        return redirect('/u/login')
    }

    const commission = await api.commission.get_commission({
        handle: session.user.handle,
        slug: params.slug
    })

    if (!commission) {
        return notFound()
    }

    const requests = await api.requests.get_requests(commission.id!)

    return (
        <DashboardContainer
            title={commission.title}
            contentClassName="flex flex-col gap-5"
        >
            <div className="flex flex-col gap-5 bg-base-200 p-5 rounded-xl shadow-xl">
                <h2 className="card-title">Commission Actions</h2>
                <div className="flex flex-row gap-5 justify-between w-full">
                    <div className="flex flex-row gap-5">
                        <Link
                            href={`/dashboard/commissions/${commission.id}/edit`}
                            className="btn btn-outline"
                        >
                            <PencilIcon className="w-6 h-6" />
                            Edit Commission
                        </Link>
                        <Link
                            href={`/dashboard/forms/${commission.form_id}`}
                            className="btn btn-outline"
                        >
                            <PencilIcon className="w-6 h-6" />
                            Edit Commission Form
                        </Link>
                    </div>
                    <CommissionPublishButton
                        id={commission.id!}
                        published={commission.published}
                    />
                </div>
            </div>
            <div className="flex flex-col gap-5 bg-base-200 p-5 rounded-xl shadow-xl">
                <h2 className="card-title">Requests</h2>
                <Tabs defaultValue="new_requests">
                    <TabsList className="w-full justify-start shadow-xl rounded-xl">
                        <TabsTrigger value="new_requests">New</TabsTrigger>
                        <TabsTrigger value="active_requests">Active</TabsTrigger>
                        <TabsTrigger value="waitlisted_requests">Waitlisted</TabsTrigger>
                        <TabsTrigger value="delivered_requests">Delivered</TabsTrigger>
                    </TabsList>
                    <TabsContent value="new_requests">
                        <div className="card bg-base-100 shadow-xl">
                            <div className="card-body">
                                <h2 className="card-title">New Requests</h2>
                                <div className="divider"></div>
                                {requests
                                    ?.filter(
                                        (request) =>
                                            request.status === RequestStatus.Pending
                                    )
                                    .map((request) => (
                                        <div
                                            key={request.id}
                                            className="flex flex-row gap-5 p-5 bg-base-200 rounded-xl transition-all duration-200 ease-in-out animate-pop-in"
                                        >
                                            <div className="flex justify-center items-center flex-col gap-5">
                                                <Avatar>
                                                    <AvatarImage
                                                        src={request.user.image!}
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
                                                    {request.user.name}
                                                </h3>
                                            </div>
                                            <div className="divider-vertical"></div>
                                            <div className="flex flex-col gap-5">
                                                <p className="text-base-content/60 italic">
                                                    Requested:{' '}
                                                    {new Date(
                                                        request.createdAt
                                                    ).toDateString()}
                                                </p>
                                                <div className="flex flex-row gap-5">
                                                    <button className="btn btn-primary">
                                                        Accept
                                                    </button>
                                                    <button className="btn btn-outline">
                                                        Decline
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                            </div>
                        </div>
                    </TabsContent>
                    <TabsContent value="active_requests">
                        <div className="card bg-base-100 shadow-xl">
                            <div className="card-body">
                                <h2 className="card-title">Active Requests</h2>
                                <div className="divider"></div>
                            </div>
                        </div>
                    </TabsContent>
                    <TabsContent value="waitlisted_requests">
                        <div className="card bg-base-100 shadow-xl">
                            <div className="card-body">
                                <h2 className="card-title">Waitlisted Requests</h2>
                                <div className="divider"></div>
                            </div>
                        </div>
                    </TabsContent>
                    <TabsContent value="delivered_requests">
                        <div className="card bg-base-100 shadow-xl">
                            <div className="card-body">
                                <h2 className="card-title">Delivered Requests</h2>
                                <div className="divider"></div>
                            </div>
                        </div>
                    </TabsContent>
                </Tabs>
            </div>
        </DashboardContainer>
    )
}
