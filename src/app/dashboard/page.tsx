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
import { InvoiceStatus } from '~/core/structures'

import { db } from '~/server/db'
import { commissions, invoices, requests } from '~/server/db/schema'

type RecentRequests = {
    commission_title: string
    requester_username: string
    created_at: string
}

type RecentInvoices = {
    status: InvoiceStatus
    created_at: string
    requester_username: string
    commission_title: string
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

const get_recent_invoices = unstable_cache(
    async (artist_id: string) => {
        const db_invoices = await db.query.invoices.findMany({
            where: eq(invoices.artist_id, artist_id),
            orderBy: (invoice, { desc }) => [desc(invoice.created_at)],
            limit: 10,
            with: {
                request: {
                    with: {
                        commission: true
                    }
                }
            }
        })

        if (db_invoices.length <= 0) {
            return []
        }

        const result: RecentInvoices[] = []
        for (const invoice of db_invoices) {
            result.push({
                status: invoice.status as InvoiceStatus,
                created_at: invoice.created_at.toLocaleDateString(),
                requester_username: (await clerkClient.users.getUser(invoice.user_id!))
                    .username!,
                commission_title: invoice.request.commission.title!
            })
        }

        return result
    },
    ['recent_invoices'],
    {
        tags: ['recent_invoices']
    }
)

const get_total_sales = unstable_cache(
    async () => {
        return undefined
    },
    ['total_sales'],
    {
        tags: ['total_sales']
    }
)

export default function DashboardHome() {
    return (
        <main className="flex flex-col gap-5">
            <h1 className="text-3xl font-bold">Home</h1>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <Suspense fallback={<Loading />}>
                    <RecentInvoices />
                </Suspense>
                <Suspense fallback={<Loading />}>
                    <RecentRequests />
                </Suspense>
            </div>
            <Card>
                <CardHeader>
                    <CardTitle>Total Sales</CardTitle>
                    <CardDescription>View total sales</CardDescription>
                </CardHeader>
                <CardContent>
                    <>Something</>
                </CardContent>
            </Card>
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

async function RecentInvoices() {
    const user = await currentUser()
    const recent_invoices = await get_recent_invoices(
        user!.privateMetadata.artist_id as string
    )

    if (recent_invoices.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Recent Invoices</CardTitle>
                    <CardDescription>View latest invoices</CardDescription>
                </CardHeader>
                <CardContent>
                    <p>No recent invoices</p>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Recent Invoices</CardTitle>
                <CardDescription>View latest invoices</CardDescription>
            </CardHeader>
            <CardContent>
                <DataTable
                    columns={[
                        {
                            accessorKey: 'commission_title',
                            header: 'Invoice ID'
                        },
                        {
                            accessorKey: 'requester_username',
                            header: 'Requester Username'
                        },
                        {
                            accessorKey: 'status',
                            header: 'Status'
                        },
                        {
                            accessorKey: 'created_at',
                            header: 'Date'
                        }
                    ]}
                    data={recent_invoices}
                />
            </CardContent>
        </Card>
    )
}

async function TotalSales() {
    const total_sales = await get_total_sales()

    return <pre>{JSON.stringify(total_sales, null, 2)}</pre>
}
