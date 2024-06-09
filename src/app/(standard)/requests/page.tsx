import { clerkClient, currentUser } from '@clerk/nextjs/server'
import { eq } from 'drizzle-orm'
import { EyeIcon } from 'lucide-react'
import { unstable_cache } from 'next/cache'
import Link from 'next/link'
import { Suspense } from 'react'
import NemuImage from '~/components/nemu-image'
import { Badge } from '~/components/ui/badge'
import Loading from '~/components/ui/loading'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { ClientRequestData, RequestStatus } from '~/core/structures'
import { get_blur_data } from '~/lib/blur_data'
import { AsRedisKey, cache } from '~/server/cache'
import { db } from '~/server/db'
import { requests } from '~/server/db/schema'

const get_request_list = unstable_cache(
    async (user_id: string) => {
        const cachedRequests = await cache.json.get(AsRedisKey('requests', user_id))

        if (cachedRequests) {
            return cachedRequests as ClientRequestData[]
        }

        const db_requests = await db.query.requests.findMany({
            where: eq(requests.user_id, user_id),
            with: {
                commission: {
                    with: {
                        artist: true
                    }
                }
            }
        })

        if (!db_requests) {
            return []
        }

        // Format for client
        const result: ClientRequestData[] = []
        for (const request of db_requests) {
            result.push({
                ...request,
                commission: {
                    ...request.commission,
                    images: [
                        {
                            url: request.commission.images[0]?.url!,
                            blur_data: await get_blur_data(
                                request.commission.images[0]?.url!
                            )
                        }
                    ]
                },
                user: await clerkClient.users.getUser(request.user_id)
            })
        }

        await cache.json.set(AsRedisKey('requests', user_id), '$', result)

        return result
    },
    ['request_list'],
    { tags: ['request_list'] }
)

export default function RequestsPage() {
    return (
        <Suspense fallback={<Loading />}>
            <PageContent />
        </Suspense>
    )
}

async function PageContent() {
    const user = await currentUser()
    const requests = await get_request_list(user!.id)

    if (requests.length === 0) {
        return (
            <main className="flex h-full w-full flex-col p-6">
                <div className="flex flex-col items-center justify-center gap-5">
                    <NemuImage src={'/nemu/sad.png'} alt="Sad" width={200} height={200} />
                    <h2 className="text-2xl font-bold">No Requests</h2>
                    <p className="text-base-content/60">You have no requests yet!</p>
                </div>
            </main>
        )
    }

    return (
        <main className="flex h-full w-full flex-col p-6">
            <Tabs defaultValue="pending">
                <TabsList className="w-full justify-start bg-base-300">
                    <TabsTrigger value="all">All</TabsTrigger>
                    <TabsTrigger value="pending">Pending</TabsTrigger>
                    <TabsTrigger value="accepted">Accepted</TabsTrigger>
                    <TabsTrigger value="rejected">Rejected</TabsTrigger>
                    <TabsTrigger value="delivered">Delivered</TabsTrigger>
                    <TabsTrigger value="waitlist">Waitlist</TabsTrigger>
                </TabsList>
                <TabsContent value="pending">
                    <div className="flex flex-col gap-5">
                        {requests
                            .filter((request) => request.status === RequestStatus.Pending)
                            .map((request) => (
                                <RequestCard key={request.id} request={request} />
                            ))}
                    </div>
                </TabsContent>
                <TabsContent value="accepted">
                    <div className="flex flex-col gap-5">
                        {requests
                            .filter(
                                (request) => request.status === RequestStatus.Accepted
                            )
                            .map((request) => (
                                <RequestCard key={request.id} request={request} />
                            ))}
                    </div>
                </TabsContent>
                <TabsContent value="rejected">
                    <div className="flex flex-col gap-5">
                        {requests
                            .filter(
                                (request) => request.status === RequestStatus.Rejected
                            )
                            .map((request) => (
                                <RequestCard key={request.id} request={request} />
                            ))}
                    </div>
                </TabsContent>
                <TabsContent value="delivered">
                    <div className="flex flex-col gap-5">
                        {requests
                            .filter(
                                (request) => request.status === RequestStatus.Delivered
                            )
                            .map((request) => (
                                <RequestCard key={request.id} request={request} />
                            ))}
                    </div>
                </TabsContent>
                <TabsContent value="waitlist">
                    <>Waitlisted</>
                </TabsContent>
            </Tabs>
        </main>
    )
}

function RequestCard({ request }: { request: ClientRequestData }) {
    if (!request.commission) {
        return null
    }

    return (
        <div className="card h-52 animate-pop-in bg-base-200 shadow-xl transition-all duration-200 ease-in-out lg:card-side">
            <figure>
                <NemuImage
                    src={request.commission.images[0]?.url || '/nemu/not-like-this.png'}
                    placeholder="blur"
                    blurDataURL={request.commission.images[0]?.blur_data!}
                    alt="Featured Image"
                    width={200}
                    height={200}
                    className="h-full"
                />
            </figure>
            <div className="card-body">
                <div className="flex h-full w-full flex-row items-center justify-between">
                    <div className="flex flex-row gap-3">
                        <div className="flex flex-col">
                            <h2 className="card-title">{request.commission.title}</h2>
                            <p className="text-base-content/60">
                                By{' '}
                                <Link
                                    className="link-hover link"
                                    href={`/@${request.commission.artist?.handle}`}
                                >
                                    @{request.commission.artist?.handle}
                                </Link>
                            </p>
                        </div>
                        <RequestStatusBadge status={request.status as RequestStatus} />
                    </div>
                    {(request.status === RequestStatus.Accepted ||
                        request.status === RequestStatus.Delivered) && (
                        <div className="flex justify-end">
                            <Link
                                href={`/requests/${request.order_id}/details`}
                                className="btn btn-primary text-white"
                            >
                                <EyeIcon className="h-6 w-6" /> View Reqeuest
                            </Link>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

function RequestStatusBadge({ status }: { status: RequestStatus }) {
    switch (status) {
        case RequestStatus.Waitlist:
            return <Badge variant="warning">Waitlist</Badge>
        case RequestStatus.Pending:
            return <Badge variant="default">Pending</Badge>
        case RequestStatus.Accepted:
            return <Badge variant="success">Accepted</Badge>
        case RequestStatus.Rejected:
            return <Badge variant="destructive">Rejected</Badge>
        case RequestStatus.Delivered:
            return <Badge>Delivered</Badge>
    }
}
