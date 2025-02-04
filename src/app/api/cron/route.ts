import { Receiver } from '@upstash/qstash'
import { serve } from '@upstash/workflow/nextjs'
import { waitUntil } from '@vercel/functions'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { env } from '~/env'

import { type RequestQueue, type StripeInvoiceData } from '~/lib/structures'
import { tryCatch } from '~/lib/try-catch'
import { db } from '~/server/db'
import { commissions, invoices, requests } from '~/server/db/schema'
import { KnockWorkflows, send_notification } from '~/server/knock'

import { get_redis_key, redis } from '~/server/redis'
import { stripe } from '~/server/stripe'

async function process_event(expired_invoices: string[]) {
    await Promise.all(
        expired_invoices.map(async (invoice_id) => {
            const invoice = await redis.get<StripeInvoiceData>(
                get_redis_key('invoices', invoice_id)
            )

            if (!invoice) {
                return
            }

            const request_queue = await redis.json.get<RequestQueue>(
                get_redis_key('request_queue', invoice.commission_id)
            )

            const commission_promise = db.query.commissions.findFirst({
                where: eq(commissions.id, invoice.commission_id),
                with: {
                    artist: true
                }
            })

            if (!request_queue) {
                throw new Error('[CRON]: Request queue not found???')
            }

            const invoice_index = request_queue.requests.findIndex(
                (request) => request === invoice.order_id
            )

            if (invoice_index === -1) {
                throw new Error('[CRON]: Invoice not found in request queue???')
            }

            // Remove from the request queue
            request_queue.requests.splice(invoice_index, 1)

            // Get the next request from the waitlist
            if (request_queue.waitlist.length > 0) {
                const new_request = request_queue.waitlist.shift()

                if (!new_request) {
                    throw new Error('[CRON]: No new request found in waitlist???')
                }

                // Add the new request to the requests array
                request_queue.requests.push(new_request)

                await redis.json.set(
                    get_redis_key('request_queue', invoice.commission_id),
                    '$',
                    request_queue as unknown as Record<string, unknown>
                )
            }

            const [commission] = await Promise.all([commission_promise])

            if (!commission) {
                throw new Error('[CRON]: Commission not found???')
            }

            return Promise.all([
                // Void the invoice
                stripe.invoices.voidInvoice(invoice_id, {
                    stripeAccount: invoice.stripe_account
                }),
                // Remove from cron
                redis.zrem('invoices_due_cron', invoice_id),
                // Send notification to user
                send_notification({
                    type: KnockWorkflows.InvoiceOverdue,
                    recipients: [invoice.user_id],
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
                    .where(eq(requests.id, invoice.request_id)),
                // Update the invoice in the database
                db
                    .update(invoices)
                    .set({
                        status: 'cancelled'
                    })
                    .where(eq(invoices.id, invoice.db_id)),
                // Update the invoice in redis to reflect new state
                redis.set(get_redis_key('invoices', invoice.id), {
                    ...invoice,
                    status: 'cancelled'
                } satisfies StripeInvoiceData)
            ])
        })
    )
}

export const { POST } = serve(
    async (context) => {
        await context.run('invoices_due_cron', async () => {
            const current_time = Math.floor(Date.now() / 1000)
            const expired_invoices = await redis.zrange<string[]>(
                'invoices_due_cron',
                0,
                current_time,
                {
                    byScore: true
                }
            )

            if (expired_invoices.length === 0) {
                return NextResponse.json({ received: true })
            }

            async function do_event_processing() {
                waitUntil(process_event(expired_invoices))
            }

            const { error } = await tryCatch(do_event_processing())

            if (error) {
                console.error('[CRON]: Error processing event', error)
            }

            return NextResponse.json({ received: true })
        })
    },
    {
        receiver: new Receiver({
            currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
            nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY
        })
    }
)
