import { type SalesData } from '~/lib/structures'
import { artistProcedure, createTRPCRouter } from '../trpc'
import { and, desc, eq, gte } from 'drizzle-orm'
import { commissions, invoices, requests } from '~/server/db/schema'
import { clerkClient } from '@clerk/nextjs/server'
import { TRPCError } from '@trpc/server'
import { calculate_percentage_change, format_to_currency } from '~/lib/utils'
import { cache, get_redis_key } from '~/server/redis'

interface RecentSalesData {
    monthly_revenue: {
        amount: number
        change: string
    }
    monthly_open_commissions: {
        count: number
        change: string
    }
    recent_sales: {
        commission_title: string
        requester_username: string
        price: string
    }[]
    recent_requests: {
        commission_title: string
        requester_username: string
        created_at: string
    }[]

    chart_data: SalesData[]
}

export const dashboard_router = createTRPCRouter({
    get_recent_data: artistProcedure.query(async ({ ctx }) => {
        const result = await cache(
            get_redis_key('dashboard_data', ctx.artist.id, 'salesData'),
            async () => {
                const client_promise = clerkClient()
                const requests_promise = ctx.db.query.commissions.findMany({
                    where: and(
                        eq(commissions.artist_id, commissions.id),
                        eq(commissions.published, true)
                    ),
                    with: {
                        requests: {
                            where: eq(requests.status, 'pending'),
                            orderBy: desc(requests.created_at)
                        }
                    }
                })

                const invoices_promise = ctx.db.query.invoices.findMany({
                    where: and(
                        eq(invoices.artist_id, ctx.artist.id),
                        eq(invoices.status, 'paid')
                    ),
                    orderBy: desc(invoices.created_at),
                    limit: 10,
                    with: {
                        request: {
                            with: {
                                commission: true
                            }
                        }
                    }
                })

                const [requests_data, invoice_data, clerk_client] = await Promise.all([
                    requests_promise,
                    invoices_promise,
                    client_promise
                ])

                // Format the recent requests
                const recent_requests: RecentSalesData['recent_requests'] = []
                for (const commission of requests_data) {
                    if (!commission.requests) {
                        continue
                    }

                    for (const request of commission.requests) {
                        const user = await clerk_client.users.getUser(request.user_id)
                        if (!user) {
                            throw new TRPCError({
                                code: 'INTERNAL_SERVER_ERROR',
                                message: 'User not found'
                            })
                        }

                        recent_requests.push({
                            commission_title: commission.title,
                            requester_username: user.username!,
                            created_at: request.created_at.toLocaleDateString()
                        })
                    }
                }

                // Format the recent sales (invoices recently paid)
                const recent_sales: RecentSalesData['recent_sales'] = []
                for (const invoice of invoice_data) {
                    const user = await clerk_client.users.getUser(invoice.user_id)
                    if (!user) {
                        throw new TRPCError({
                            code: 'INTERNAL_SERVER_ERROR',
                            message: 'User not found'
                        })
                    }

                    recent_sales.push({
                        commission_title: invoice.request.commission.title,
                        requester_username: user.username!,
                        price: format_to_currency(invoice.total)
                    })
                }

                // Get the sales data
                const start_date = new Date()
                const last_month = new Date()
                last_month.setMonth(last_month.getMonth() - 1)
                start_date.setMonth(start_date.getMonth() - 6)

                const six_month_requests_data = await ctx.db.query.commissions.findMany({
                    where: eq(commissions.artist_id, ctx.artist.id),
                    with: {
                        requests: {
                            where: and(
                                gte(requests.created_at, start_date),
                                eq(requests.status, 'delivered')
                            ),
                            with: {
                                invoices: true
                            }
                        }
                    }
                })

                let monthly_open_commissions = 0
                let previous_monthly_open_commissions = 0

                let total_revenue = 0
                let previous_total_revenue = 0

                const sales_data: Record<string, SalesData> = {}

                // TODO: Finish the stats collection after all improvements have been made
                for (const commission of six_month_requests_data) {
                    for (const request of commission.requests) {
                        const charge_month = request.created_at.toLocaleString('en-US', {
                            month: 'long'
                        })
                        sales_data[charge_month] = {
                            month: request.created_at.toLocaleString('en-US', {
                                month: 'long'
                            }),
                            total_sales: request.invoices.reduce(
                                (acc, invoice) => acc + invoice.total,
                                0
                            )
                        }

                        if (
                            request.status === 'accepted' &&
                            request.created_at > last_month
                        ) {
                            monthly_open_commissions += 1
                        } else if (
                            request.status === 'accepted' &&
                            request.created_at < last_month
                        ) {
                            previous_monthly_open_commissions += 1
                        }

                        if (
                            request.status === 'delivered' &&
                            request.created_at < last_month
                        ) {
                            previous_total_revenue += request.invoices.reduce(
                                (acc, invoice) => acc + invoice.total,
                                0
                            )
                        } else if (
                            request.status === 'delivered' &&
                            request.created_at > last_month
                        ) {
                            total_revenue += request.invoices.reduce(
                                (acc, invoice) => acc + invoice.total,
                                0
                            )
                        }
                    }
                }

                const result: RecentSalesData = {
                    monthly_revenue: {
                        amount: total_revenue,
                        change: calculate_percentage_change(
                            total_revenue,
                            previous_total_revenue
                        )
                    },
                    monthly_open_commissions: {
                        count: monthly_open_commissions,
                        change: calculate_percentage_change(
                            monthly_open_commissions,
                            previous_monthly_open_commissions
                        )
                    },
                    recent_sales: recent_sales,
                    recent_requests: recent_requests,
                    chart_data: Object.entries(sales_data).map(([key, value]) => ({
                        month: key,
                        total_sales: value.total_sales
                    }))
                }

                return result
            },
            3600
        )

        return result
    })
})
