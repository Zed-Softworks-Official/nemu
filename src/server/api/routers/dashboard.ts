import { artistProcedure, createTRPCRouter } from '~/server/api/trpc'
import { and, desc, eq, gte } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { clerkClient } from '@clerk/nextjs/server'

import { commissions, invoices, requests } from '~/server/db/schema'
import { calculatePercentageChange, formatToCurrency } from '~/lib/utils'
import { cache, getRedisKey } from '~/server/redis'
import { type SalesData } from '~/lib/types'

interface RecentSalesData {
    monthlyRevenue: {
        amount: number
        change: string
    }
    monthlyOpenCommissions: {
        count: number
        change: string
    }
    recentSales: {
        commissionTitle: string
        requesterUsername: string
        price: string
    }[]
    recentRequests: {
        commissionTitle: string
        requesterUsername: string
        createdAt: string
    }[]
    chartData: SalesData[]
}

export const dashboardRouter = createTRPCRouter({
    getRecentData: artistProcedure.query(async ({ ctx }) => {
        const result = await cache(
            getRedisKey('dashboard_data', ctx.artist.id, 'salesData'),
            async () => {
                const client_promise = clerkClient()
                const requests_promise = ctx.db.query.commissions.findMany({
                    where: and(
                        eq(commissions.artistId, ctx.artist.id),
                        eq(commissions.published, true)
                    ),
                    with: {
                        requests: {
                            where: eq(requests.status, 'pending'),
                            orderBy: desc(requests.createdAt)
                        }
                    }
                })

                const invoices_promise = ctx.db.query.invoices.findMany({
                    where: and(
                        eq(invoices.artistId, ctx.artist.id),
                        eq(invoices.status, 'paid')
                    ),
                    orderBy: desc(invoices.createdAt),
                    limit: 10,
                    with: {
                        request: {
                            with: {
                                commission: true
                            }
                        }
                    }
                })

                const [requests_data, invoice_data, clerk] = await Promise.all([
                    requests_promise,
                    invoices_promise,
                    client_promise
                ])

                // Format the recent requests
                const recentRequests: RecentSalesData['recentRequests'] = []
                for (const commission of requests_data) {
                    if (!commission.requests) {
                        continue
                    }

                    for (const request of commission.requests) {
                        const user = await clerk.users.getUser(request.userId)
                        if (!user) {
                            throw new TRPCError({
                                code: 'INTERNAL_SERVER_ERROR',
                                message: 'User not found'
                            })
                        }

                        recentRequests.push({
                            commissionTitle: commission.title,
                            requesterUsername: user.username ?? 'Unknown',
                            createdAt: request.createdAt.toLocaleDateString()
                        })
                    }
                }

                // Format the recent sales (invoices recently paid)
                const recentSales: RecentSalesData['recentSales'] = []
                for (const invoice of invoice_data) {
                    const user = await clerk.users.getUser(invoice.userId)
                    if (!user) {
                        throw new TRPCError({
                            code: 'INTERNAL_SERVER_ERROR',
                            message: 'User not found'
                        })
                    }

                    recentSales.push({
                        commissionTitle: invoice.request.commission.title,
                        requesterUsername: user.username ?? 'Unknown',
                        price: formatToCurrency(invoice.total)
                    })
                }

                // Get the sales data
                const startDate = new Date()
                const lastMonth = new Date()
                lastMonth.setMonth(lastMonth.getMonth() - 1)
                startDate.setMonth(startDate.getMonth() - 6)

                const six_month_requests_data = await ctx.db.query.commissions.findMany({
                    where: eq(commissions.artistId, ctx.artist.id),
                    with: {
                        requests: {
                            where: and(
                                gte(requests.createdAt, startDate),
                                eq(requests.status, 'delivered')
                            ),
                            with: {
                                invoices: true
                            }
                        }
                    }
                })

                let monthlyOpenCommissions = 0
                let previousMonthlyOpenCommissions = 0

                let totalRevenue = 0
                let previousTotalRevenue = 0

                const sales_data: Record<string, SalesData> = {}

                // TODO: Finish the stats collection after all improvements have been made
                for (const commission of six_month_requests_data) {
                    for (const request of commission.requests) {
                        const charge_month = request.createdAt.toLocaleString('en-US', {
                            month: 'long'
                        })
                        sales_data[charge_month] = {
                            month: request.createdAt.toLocaleString('en-US', {
                                month: 'long'
                            }),
                            totalSales: request.invoices.reduce(
                                (acc, invoice) => acc + invoice.total,
                                0
                            )
                        }

                        if (
                            request.status === 'accepted' &&
                            request.createdAt > lastMonth
                        ) {
                            monthlyOpenCommissions += 1
                        } else if (
                            request.status === 'accepted' &&
                            request.createdAt < lastMonth
                        ) {
                            previousMonthlyOpenCommissions += 1
                        }

                        if (
                            request.status === 'delivered' &&
                            request.createdAt < lastMonth
                        ) {
                            previousTotalRevenue += request.invoices.reduce(
                                (acc, invoice) => acc + invoice.total,
                                0
                            )
                        } else if (
                            request.status === 'delivered' &&
                            request.createdAt > lastMonth
                        ) {
                            totalRevenue += request.invoices.reduce(
                                (acc, invoice) => acc + invoice.total,
                                0
                            )
                        }
                    }
                }

                const result: RecentSalesData = {
                    monthlyRevenue: {
                        amount: totalRevenue,
                        change: calculatePercentageChange(
                            totalRevenue,
                            previousTotalRevenue
                        )
                    },
                    monthlyOpenCommissions: {
                        count: monthlyOpenCommissions,
                        change: calculatePercentageChange(
                            monthlyOpenCommissions,
                            previousMonthlyOpenCommissions
                        )
                    },
                    recentSales: recentSales,
                    recentRequests: recentRequests,
                    chartData: Object.entries(sales_data).map(([key, value]) => ({
                        month: key,
                        totalSales: value.totalSales
                    }))
                }

                return result
            },
            3600
        )

        return result
    })
})
