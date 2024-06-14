import { clerkClient, currentUser } from '@clerk/nextjs/server'
import { desc, eq } from 'drizzle-orm'
import { unstable_cache } from 'next/cache'
import { Suspense } from 'react'
import DataTable from '~/components/data-table'
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from '~/components/ui/card'
import Loading from '~/components/ui/loading'

import { db } from '~/server/db'
import { commissions, requests } from '~/server/db/schema'

type RecentRequests = {
    commission_title: string
    requester_username: string
    created_at: string
}

const get_recent_requests = unstable_cache(
    async (artist_id: string) => {
        const db_requests = await db
            .select()
            .from(commissions)
            .where(eq(commissions.artist_id, artist_id))
            .leftJoin(requests, eq(requests.commission_id, commissions.id))
            .orderBy(desc(requests.created_at))
            .limit(10)

        if (!db_requests) {
            return []
        }

        const result: RecentRequests[] = []
        for (const recent of db_requests) {
            if (!recent.commission || !recent.request) {
                continue
            }

            result.push({
                commission_title: recent.commission.title!,
                requester_username: (
                    await clerkClient.users.getUser(recent.request?.user_id!)
                ).username!,
                created_at: recent.request.created_at.toLocaleDateString()
            })
        }

        return result
    },
    ['recent_commissions'],
    {
        tags: ['commission_requests']
    }
)

export default function DashboardHome() {
    return (
        <main className="flex flex-col gap-5">
            <h1 className="text-3xl font-bold">Home</h1>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                <Card>
                    <CardHeader>
                        <CardTitle>Something else</CardTitle>
                        <CardDescription>Oh boy, something else</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <>Hello, World!</>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Invoices</CardTitle>
                        <CardDescription>
                            View Invoice Statuses at a glance
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <>Hello, World!</>
                    </CardContent>
                </Card>
                <Suspense fallback={<Loading />}>
                    <RecentRequests />
                </Suspense>
            </div>
        </main>
    )
}

async function RecentRequests() {
    const user = await currentUser()
    const recent_requests = await get_recent_requests(
        user!.privateMetadata.artist_id as string
    )

    if (recent_requests.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Recent Requests</CardTitle>
                    <CardDescription>View latest requests requests</CardDescription>
                </CardHeader>
                <CardContent>
                    <p>No recent requests</p>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Recent Requests</CardTitle>
                <CardDescription>View latest requests requests</CardDescription>
            </CardHeader>
            <CardContent>
                <DataTable
                    columns={[
                        {
                            accessorKey: 'commission_title',
                            header: 'Commission Title'
                        },
                        {
                            accessorKey: 'requester_username',
                            header: 'Requester Username'
                        },
                        {
                            accessorKey: 'created_at',
                            header: 'Date'
                        }
                    ]}
                    data={recent_requests}
                />
            </CardContent>
        </Card>
    )
}
