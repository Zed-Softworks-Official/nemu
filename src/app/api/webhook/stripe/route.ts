import Stripe from 'stripe'
import { NextResponse, type NextRequest } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'

import { env } from '~/env'
import { InvoiceStatus, PurchaseType, type StripePaymentMetadata } from '~/lib/structures'
import { db } from '~/server/db'
import { artists, invoices } from '~/server/db/schema'
import { eq } from 'drizzle-orm'
import { knock, KnockWorkflows } from '~/server/knock'

export async function POST(req: NextRequest) {
    const clerk_client_promise = clerkClient()
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

    const clerk_client = await clerk_client_promise
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

                await knock.workflows.trigger(KnockWorkflows.InvoicePaid, {
                    recipients: [data.artist.user_id],
                    data: {
                        commission_title: data.request.commission.title,
                        request_username: clerk_client.users
                            .getUser(data.user_id)
                            .then((user) => user?.username)
                    }
                })
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
    }

    return NextResponse.json({ handled: true })
}
