import { clerkClient, currentUser } from '@clerk/nextjs/server'
import { type ColumnDef } from '@tanstack/react-table'
import { and, desc, eq, gte } from 'drizzle-orm'
import { DollarSign, Palette, ShoppingCart } from 'lucide-react'
import { unstable_cache } from 'next/cache'
import { notFound, redirect } from 'next/navigation'
import { Suspense } from 'react'

import { SalesChart } from './sales-chart'
import { DataTable } from '~/components/data-table'
import NemuImage from '~/components/nemu-image'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import Loading from '~/components/ui/loading'
import { InvoiceStatus, type SalesData } from '~/lib/structures'
import { calculate_percentage_change, format_to_currency } from '~/lib/utils'

import { db } from '~/server/db'
import { artists, commissions, invoices, requests } from '~/server/db/schema'
import { stripe } from '~/server/stripe'

interface SalesStat {
    count: string | number
    change: string
}

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

type RecentSales = {
    commission_title: string
    requester_username: string
    price: string
}

type RecentSalesData = {
    sales_data: SalesData[]
    total_revenue: SalesStat
    total_sales: SalesStat
    total_requests: SalesStat
}

const get_recent_requests = unstable_cache(
    async (artist_id: string) => {
        const clerk_client = await clerkClient()

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
                commission_title: recent.commission.title,
                requester_username: (
                    await clerk_client.users.getUser(recent.request?.user_id)
                ).username!,
                created_at: recent.request.created_at.toLocaleDateString()
            })
        }

        return result
    },
    ['recent_commissions'],
    {
        tags: ['commission_requests'],
        revalidate: 3600
    }
)

const get_recent_invoices = unstable_cache(
    async (artist_id: string) => {
        const clerk_client = await clerkClient()
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
                requester_username: (await clerk_client.users.getUser(invoice.user_id))
                    .username!,
                commission_title: invoice.request.commission.title
            })
        }

        return result
    },
    ['recent_invoices'],
    {
        tags: ['recent_invoices'],
        revalidate: 3600
    }
)

const get_recent_sales = unstable_cache(
    async (artist_id: string) => {
        const clerk_client = await clerkClient()
        const db_invoices = await db.query.invoices.findMany({
            where: and(
                eq(invoices.artist_id, artist_id),
                eq(invoices.status, InvoiceStatus.Paid)
            ),
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

        const result: RecentSales[] = []

        for (const invoice of db_invoices) {
            result.push({
                commission_title: invoice.request.commission.title,
                requester_username:
                    (await clerk_client.users.getUser(invoice.user_id)).username ??
                    'User',
                price: format_to_currency(invoice.total)
            })
        }

        return result
    },
    ['total_sales'],
    {
        tags: ['total_sales'],
        revalidate: 3600
    }
)

const get_recent_data = unstable_cache(
    async (artist_id: string) => {
        // Get the artist from the db
        const artist = await db.query.artists.findFirst({
            where: eq(artists.id, artist_id)
        })

        if (!artist) {
            return undefined
        }

        // Get the date 6 months prior
        const start_date = new Date()
        const current_date = new Date()
        start_date.setMonth(start_date.getMonth() - 6)

        // Get the requests from the db
        const db_requests = await db
            .select()
            .from(commissions)
            .where(eq(commissions.artist_id, artist_id))
            .leftJoin(
                requests,
                and(
                    eq(requests.commission_id, commissions.id),
                    gte(requests.created_at, start_date)
                )
            )

        // Fetch the sales data from stripe
        const charges = await stripe.charges.list(
            {
                created: {
                    gte: Math.floor(start_date.getTime() / 1000)
                }
            },
            { stripeAccount: artist.stripe_account }
        )

        // Create the sales data object for the chart
        const sales_data: Record<string, SalesData> = {}

        // Loop through the charges and add the amount to the correct month in the sales data
        let total_revenue_amount = 0
        let previous_total_revenue_amount = 0

        let total_sales_amount = 0
        let previous_sales_amount = 0

        for (const charge of charges.data) {
            // Check if the charge is a successful charge
            if (charge.status !== 'succeeded') {
                continue
            }

            // Convert the charge date from utc epoch to a date object
            const charge_date = new Date(0)
            charge_date.setUTCSeconds(charge.created)

            const charge_month = charge_date.toLocaleString('en-US', { month: 'long' })
            sales_data[charge_month] = {
                month: charge_date.toLocaleString('en-US', { month: 'long' }),
                total_sales: sales_data[charge_month]
                    ? (sales_data[charge_month].total_sales += charge.amount / 100)
                    : charge.amount / 100
            }

            // Increment the total sales amount if the sale is from the current month
            if (current_date.getMonth() === charge_date.getMonth()) {
                total_sales_amount += 1
            }

            // Add the amount to the total revenue
            total_revenue_amount += charge.amount / 100

            // if the charge is from the previous month of our current month, add it to the previous revenue total
            const previous_date = new Date(
                charge_date.getMonth() - 1,
                charge_date.getDate()
            )
            const previous_month = previous_date.getMonth()

            if (current_date.getMonth() - 1 === previous_month) {
                previous_total_revenue_amount += charge.amount / 100
                previous_sales_amount += 1
            }
        }

        // Calculate the percentage change for the requests
        let total_requests_amount = 0
        let previous_total_requests_amount = 0
        for (const { request } of db_requests) {
            // Check if the request exists
            if (!request) {
                continue
            }

            // Check if the request is from the current month, then add it to the total for the current month
            // otherwise check if the request is from the previous month, then add it to the previous month total
            const request_date = new Date(request.created_at)

            if (current_date.getMonth() === request_date.getMonth()) {
                total_requests_amount += 1
            } else if (current_date.getMonth() - 1 === request_date.getMonth()) {
                previous_total_requests_amount += 1
            }
        }

        // Construct the recent sales data
        const result: RecentSalesData = {
            sales_data: Object.entries(sales_data).map(([key, value]) => ({
                month: key,
                total_sales: value.total_sales
            })),
            total_revenue: {
                count: format_to_currency(total_revenue_amount),
                change: calculate_percentage_change(
                    total_revenue_amount,
                    previous_total_revenue_amount
                )
            },
            total_sales: {
                count: total_sales_amount,
                change: calculate_percentage_change(
                    total_sales_amount,
                    previous_sales_amount
                )
            },
            total_requests: {
                count: total_requests_amount,
                change: calculate_percentage_change(
                    total_requests_amount,
                    previous_total_requests_amount
                )
            }
        }

        return result
    },
    ['total_sales'],
    {
        tags: ['total_sales'],
        revalidate: 3600
    }
)

export default function DashboardHome() {
    return (
        <main className="container mx-auto flex flex-col gap-5 px-5">
            <h1 className="text-3xl font-bold">Home</h1>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <Suspense fallback={<Loading />}>
                    <CommissionStats />
                </Suspense>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
                <Card className="col-span-4">
                    <CardHeader>
                        <CardTitle>Last 6 Months Sales</CardTitle>
                    </CardHeader>
                    <CardContent className="pl-2">
                        <Suspense fallback={<Loading />}>
                            <TotalSales />
                        </Suspense>
                    </CardContent>
                </Card>
                <Card className="col-span-3">
                    <CardHeader>
                        <CardTitle>Recent Invoices</CardTitle>
                    </CardHeader>
                    <Suspense fallback={<Loading />}>
                        <RecentInvoices />
                    </Suspense>
                </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Recent Requests</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Suspense fallback={<Loading />}>
                            <RecentRequests />
                        </Suspense>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Recent Sales</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Suspense fallback={<Loading />}>
                            <RecentSales />
                        </Suspense>
                    </CardContent>
                </Card>
            </div>
        </main>
    )
}

async function CommissionStats() {
    const user = await currentUser()

    if (!user) {
        return redirect('/u/login')
    }

    const recent_sales = await get_recent_data(user.privateMetadata.artist_id as string)

    if (!recent_sales) {
        return notFound()
    }

    return (
        <>
            <StatsCard
                title="Total Sales"
                icon={<DollarSign className="text-base-content/80 h-4 w-4" />}
                value={recent_sales.total_sales.count.toString()}
                change={recent_sales.total_sales.change}
            />
            <StatsCard
                title="Total Revenue"
                icon={<Palette className="text-base-content/80 h-4 w-4" />}
                value={recent_sales.total_revenue.count.toString()}
                change={recent_sales.total_revenue.change}
            />
            <StatsCard
                title="New Requests"
                icon={<ShoppingCart className="text-base-content/80 h-4 w-4" />}
                value={recent_sales.total_requests.count.toString()}
                change={recent_sales.total_requests.change}
            />
        </>
    )
}

function StatsCard(props: {
    title: string
    icon: React.ReactNode
    value: string
    change: string
}) {
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{props.title}</CardTitle>
                {props.icon}
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{props.value}</div>
                <p className="text-base-content/80 text-xs">
                    {props.change} from last month
                </p>
            </CardContent>
        </Card>
    )
}

async function RecentSales() {
    const user = await currentUser()

    if (!user) {
        return redirect('/u/login')
    }

    const recent_sales = await get_recent_sales(user.privateMetadata.artist_id as string)

    const columns: ColumnDef<RecentSales>[] = [
        {
            accessorKey: 'commission_title',
            header: 'Commission Title'
        },
        {
            accessorKey: 'requester_username',
            header: 'Requester Username'
        },
        {
            accessorKey: 'price',
            header: 'Price'
        }
    ]

    return <DataTable columns={columns} data={recent_sales} />
}

async function RecentRequests() {
    const user = await currentUser()

    if (!user) {
        return redirect('/u/login')
    }

    const recent_requests = await get_recent_requests(
        user.privateMetadata.artist_id as string
    )

    if (recent_requests.length === 0) {
        return (
            <CardContent>
                <p>No recent requests</p>
            </CardContent>
        )
    }

    return (
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
    )
}

async function RecentInvoices() {
    const user = await currentUser()
    const recent_invoices = await get_recent_invoices(
        user!.privateMetadata.artist_id as string
    )

    if (recent_invoices.length === 0) {
        return (
            <CardContent>
                <p>No recent invoices</p>
            </CardContent>
        )
    }

    return (
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
    )
}

async function TotalSales() {
    const user = await currentUser()
    if (!user) {
        return redirect('/u/login')
    }

    const recent_sales = await get_recent_data(user.privateMetadata.artist_id as string)

    if (!recent_sales) {
        return <NemuImage src={'/nemu/sad.png'} alt="Sad" width={200} height={200} />
    }

    return <SalesChart sales_data={recent_sales.sales_data} />
}
