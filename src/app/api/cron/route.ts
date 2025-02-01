import { waitUntil } from '@vercel/functions'
import { eq } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { env } from '~/env'

import { InvoiceStatus, RequestStatus, type StripeInvoiceData } from '~/lib/structures'
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

            const commission = await db.query.commissions.findFirst({
                where: eq(commissions.id, invoice.commission_id),
                with: {
                    artist: true
                }
            })

            if (!commission) {
                throw new Error('[CRON]: Commission not found???')
            }

            const invoice_index = await redis.json.arrindex(
                get_redis_key('request_queue', invoice.commission_id),
                '$.requests',
                invoice.id
            )

            if (!invoice_index[0]) {
                throw new Error('[CRON]: Invoice not found in request queue???')
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
                        status: RequestStatus.Rejected
                    })
                    .where(eq(requests.id, invoice.request_id)),
                // Remove from the request queue
                redis.json.arrpop(
                    get_redis_key('request_queue', invoice.commission_id),
                    '$.requests',
                    invoice_index[0]
                ),
                // Update the invoice in the database
                db
                    .update(invoices)
                    .set({
                        status: InvoiceStatus.Cancelled
                    })
                    .where(eq(invoices.id, invoice.db_id)),
                // Update the invoice in redis to reflect new state
                redis.set(get_redis_key('invoices'), {
                    ...invoice,
                    status: InvoiceStatus.Cancelled
                } satisfies StripeInvoiceData)
            ])
        })
    )
}

export async function POST(req: NextRequest) {
    const signature = req.headers.get('nemu-cron-token')

    if (signature) {
        console.log('HOW?')
        return NextResponse.json({ received: true }, { status: 401 })
    }

    const current_time = Math.floor(Date.now() / 1000)
    const expired_invoices = await redis.zrange<string[]>(
        'invoices_due_cron',
        0,
        current_time,
        {
            byScore: true
        }
    )

    async function do_event_processing() {
        if (typeof signature !== 'string') {
            throw new Error('[CRON]: Signature is not a string???')
        }

        waitUntil(process_event(expired_invoices))
    }

    const { error } = await tryCatch(do_event_processing())

    if (error) {
        console.error('[CRON]: Error processing event', error)
    }

    return NextResponse.json({ received: true })
}
