import Stripe from 'stripe'
import { NextResponse, type NextRequest } from 'next/server'

import { env } from '~/env'
import {
    InvoiceStatus,
    PurchaseType,
    RequestStatus,
    type StripePaymentMetadata
} from '~/lib/structures'
import { db } from '~/server/db'
import { artists, commissions, invoices, requests } from '~/server/db/schema'
import { eq, sql } from 'drizzle-orm'
import { KnockWorkflows, send_notification } from '~/server/knock'
import { get_redis_key, redis } from '~/server/redis'

export async function POST(req: NextRequest) {
    const sig = req.headers.get('stripe-signature')

    if (!req.body || !sig) {
        return NextResponse.json({ error: 'Missing body or signature' }, { status: 400 })
    }

    let evt: Stripe.Event
    try {
        evt = Stripe.webhooks.constructEvent(
            await req.text(),
            sig,
            env.STRIPE_WEBHOOK_SECRET
        )
    } catch (error) {
        console.error('Error verifying stripe webhook', error)

        return NextResponse.json(
            { error: 'Error verifying stripe webhook' },
            { status: 400 }
        )
    }

    switch (evt.type) {
        case 'invoice.paid':
            {
                const invoice = evt.data.object
                const metadata = invoice.metadata as unknown as StripePaymentMetadata

                if (
                    metadata.purchase_type !== PurchaseType.CommissionInvoice ||
                    !metadata.invoice_id
                ) {
                    console.error(metadata)

                    return NextResponse.json(
                        { error: 'Invalid invoice metadata' },
                        { status: 400 }
                    )
                }

                const update_promise = db
                    .update(invoices)
                    .set({
                        status: InvoiceStatus.Paid
                    })
                    .where(eq(invoices.id, metadata.invoice_id))

                const query_promise = db.query.invoices.findFirst({
                    where: eq(invoices.id, metadata.invoice_id),
                    with: {
                        request: {
                            with: {
                                commission: true
                            }
                        },
                        artist: true
                    }
                })

                const [, data] = await Promise.all([update_promise, query_promise])

                if (!data) {
                    return NextResponse.json(
                        { error: 'Invoice not found' },
                        { status: 404 }
                    )
                }

                await send_notification({
                    type: KnockWorkflows.InvoicePaid,
                    recipients: [data.artist.user_id],
                    data: {
                        commission_title: data.request.commission.title,
                        request_url: `${env.BASE_URL}/dashboard/commissions/${data.request.commission.slug}/${data.request.order_id}`
                    },
                    actor: data.user_id
                })
            }
            break
        case 'invoice.overdue':
            {
                const invoice = evt.data.object
                const metadata = invoice.metadata as unknown as StripePaymentMetadata

                // Mark the request as rejected
                if (!metadata.invoice_id) {
                    return NextResponse.json(
                        {
                            error: 'Missing Invoice ID'
                        },
                        {
                            status: 400
                        }
                    )
                }

                const request_invoice = await db.query.invoices.findFirst({
                    where: eq(invoices.id, metadata.invoice_id),
                    with: {
                        request: {
                            with: {
                                commission: true
                            }
                        },
                        artist: true
                    }
                })

                if (!request_invoice) {
                    return NextResponse.json(
                        {
                            error: 'Invoice not found'
                        },
                        {
                            status: 404
                        }
                    )
                }

                const update_request = db
                    .update(requests)
                    .set({
                        status: RequestStatus.Rejected
                    })
                    .where(eq(requests.id, request_invoice.request_id))

                // TODO: Check to see if this works
                const notification_promise = send_notification({
                    type: KnockWorkflows.InvoiceOverdue,
                    recipients: [request_invoice.user_id, request_invoice.artist.user_id],
                    data: {
                        artist_handle: request_invoice.artist.handle,
                        commission_title: request_invoice.request.commission.title,
                        commission_url: `${env.BASE_URL}/@${request_invoice.artist.handle}/commission/${request_invoice.request.commission.slug}`
                    }
                })

                // Reject the request and update the commission stats
                const update_commission = db
                    .update(commissions)
                    .set({
                        accepted_requests: sql`${request_invoice.request.commission.accepted_requests} - 1`,
                        rejected_requests: sql`${request_invoice.request.commission.rejected_requests} + 1`
                    })
                    .where(eq(commissions.id, request_invoice.request.commission_id))

                await Promise.all([
                    update_request,
                    update_commission,
                    notification_promise
                ])
            }
            break
        case 'customer.subscription.created':
            {
                const subscription = evt.data.object
                await db
                    .update(artists)
                    .set({
                        supporter: true
                    })
                    .where(eq(artists.zed_customer_id, subscription.customer as string))
            }
            break
        case 'customer.subscription.deleted':
            {
                const subscription = evt.data.object

                await db
                    .update(artists)
                    .set({
                        supporter: false
                    })
                    .where(eq(artists.zed_customer_id, subscription.customer as string))
            }
            break
        case 'account.updated':
            {
                const account = evt.data.object

                // Only proceed if this is an onboarding completion
                if (!account.charges_enabled || !account.details_submitted) {
                    return NextResponse.json({ handled: true })
                }

                const artist = await db.query.artists.findFirst({
                    where: eq(artists.stripe_account, account.id)
                })

                if (!artist) {
                    return NextResponse.json(
                        { error: 'Artist not found' },
                        { status: 404 }
                    )
                }

                const db_promise = db
                    .update(artists)
                    .set({
                        onboarded: true
                    })
                    .where(eq(artists.id, artist.id))

                const redis_promise = redis.del(
                    get_redis_key('dashboard_links', artist.id)
                )

                await Promise.all([db_promise, redis_promise])
            }
            break
    }

    return NextResponse.json({ handled: true })
}
