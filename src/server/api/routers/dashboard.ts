import { InvoiceStatus, RequestStatus, type SalesData } from '~/lib/structures'
import { artistProcedure, createTRPCRouter } from '../trpc'
import { and, desc, eq, gte } from 'drizzle-orm'
import { commissions, invoices, requests } from '~/server/db/schema'
import { clerkClient } from '@clerk/nextjs/server'
import { TRPCError } from '@trpc/server'
import { format_to_currency } from '~/lib/utils'

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
        const client_promise = clerkClient()
        const requests_promise = ctx.db.query.commissions.findMany({
            where: and(
                eq(commissions.artist_id, commissions.id),
                eq(commissions.published, true)
            ),
            with: {
                requests: {
                    where: eq(requests.status, RequestStatus.Pending),
                    orderBy: desc(requests.created_at)
                }
            }
        })

        const invoices_promise = ctx.db.query.invoices.findMany({
            where: and(
                eq(invoices.artist_id, ctx.artist.id),
                eq(invoices.status, InvoiceStatus.Paid)
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
        const current_date = new Date()
        start_date.setMonth(start_date.getMonth() - 6)

        const six_month_requests_data = await ctx.db.query.commissions.findMany({
            where: eq(commissions.artist_id, ctx.artist.id),
            with: {
                requests: {
                    where: and(
                        gte(requests.created_at, start_date),
                        eq(requests.status, RequestStatus.Delivered)
                    )
                }
            }
        })

        const monthly_open_commissions = 0
        const previous_monthly_open_commissions = 0

        const total_revenue = 0
        const previous_total_revenue = 0

        // TODO: Finish the stats collection after all improvements have been made
    })
})
