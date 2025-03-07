import { eq } from 'drizzle-orm'
import { waitUntil } from '@vercel/functions'
import { type NextRequest, NextResponse } from 'next/server'
import { env } from '~/env'
import { tryCatch } from '~/lib/try-catch'
import type { RequestQueue, StripeInvoiceData } from '~/lib/types'

import { db } from '~/server/db'
import { getRedisKey, redis } from '~/server/redis'
import { commissions, invoices, requests } from '~/server/db/schema'
import { stripe } from '~/server/stripe'
import { KnockWorkflows, sendNotification } from '~/server/knock'

async function processEvent(expiredInvoices: string[]) {
    await Promise.all(
        expiredInvoices.map(async (invoiceId) => {
            const invoice = await redis.get<StripeInvoiceData>(
                getRedisKey('invoices', invoiceId)
            )

            if (!invoice) {
                return
            }

            const requestQueue = await redis.json.get<RequestQueue>(
                getRedisKey('request_queue', invoice.commissionId)
            )

            const commission_promise = db.query.commissions.findFirst({
                where: eq(commissions.id, invoice.commissionId),
                with: {
                    artist: true
                }
            })

            if (!requestQueue) {
                throw new Error('[CRON]: Request queue not found???')
            }

            const invoiceIndex = requestQueue.requests.findIndex(
                (request) => request === invoice.orderId
            )

            if (invoiceIndex === -1) {
                throw new Error('[CRON]: Invoice not found in request queue???')
            }

            // Remove from the request queue
            requestQueue.requests.splice(invoiceIndex, 1)

            // Get the next request from the waitlist
            if (requestQueue.waitlist.length > 0) {
                const newRequest = requestQueue.waitlist.shift()

                if (!newRequest) {
                    throw new Error('[CRON]: No new request found in waitlist???')
                }

                // Add the new request to the requests array
                requestQueue.requests.push(newRequest)

                await redis.json.set(
                    getRedisKey('request_queue', invoice.commissionId),
                    '$',
                    requestQueue as unknown as Record<string, unknown>
                )
            }

            const [commission] = await Promise.all([commission_promise])

            if (!commission) {
                throw new Error('[CRON]: Commission not found???')
            }

            return Promise.all([
                // Void the invoice
                stripe.invoices.voidInvoice(invoiceId, {
                    stripeAccount: invoice.stripeAccount
                }),
                // Remove from cron
                redis.zrem('invoicesDueCron', invoiceId),
                // Send notification to user
                sendNotification({
                    type: KnockWorkflows.InvoiceOverdue,
                    recipients: [invoice.userId],
                    data: {
                        artist_handle: commission.artist.handle,
                        commission_title: commission.title,
                        commission_url: `${env.BASE_URL}/@${commission.artist.handle}/commission/${commission.slug}`
                    }
                }),
                // Update request status in the database
                db
                    .update(requests)
                    .set({
                        status: 'cancelled'
                    })
                    .where(eq(requests.id, invoice.requestId)),
                // Update the invoice in the database
                db
                    .update(invoices)
                    .set({
                        status: 'cancelled'
                    })
                    .where(eq(invoices.id, invoice.dbId)),
                // Update the invoice in redis to reflect new state
                redis.set(getRedisKey('invoices', invoice.id), {
                    ...invoice,
                    status: 'cancelled'
                } satisfies StripeInvoiceData)
            ])
        })
    )
}

export async function POST(req: NextRequest) {
    if (req.headers.get('Authorization') !== `Bearer ${env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentTime = Math.floor(Date.now() / 1000)
    const expiredInvoices = await redis.zrange<string[]>(
        'invoicesDueCron',
        0,
        currentTime,
        {
            byScore: true
        }
    )

    if (expiredInvoices.length === 0) {
        return NextResponse.json({ received: true })
    }

    async function doEventProcessing() {
        waitUntil(processEvent(expiredInvoices))
    }

    const { error } = await tryCatch(doEventProcessing())

    if (error) {
        console.error('[CRON]: Error processing event', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    return NextResponse.json({ received: true })
}
