import { notFound, redirect } from 'next/navigation'

import { api } from '~/trpc/server'
import { getServerAuthSession } from '~/server/auth'

import DashboardContainer from '~/components/ui/dashboard-container'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import Link from 'next/link'
import { PencilIcon } from 'lucide-react'
import CommissionPublishButton from '~/components/dashboard/commission-publish'
import { RequestStatus } from '~/core/structures'
import RequestCard from '~/components/dashboard/request-card'

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

    const requests = await api.requests.get_request_list(commission.id!)

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
                            href={`/dashboard/commissions/${commission.slug}/update`}
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
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                                    {requests
                                        ?.filter(
                                            (request) =>
                                                request.status === RequestStatus.Pending
                                        )
                                        .map((request) => (
                                            <RequestCard
                                                key={request.id}
                                                request={request}
                                            />
                                        ))}
                                </div>
                            </div>
                        </div>
                    </TabsContent>
                    <TabsContent value="active_requests">
                        <div className="card bg-base-100 shadow-xl">
                            <div className="card-body">
                                <h2 className="card-title">Active Requests</h2>
                                <div className="divider"></div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                                    {requests
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
