import Stripe from 'stripe'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { env } from '~/env'
import { db } from '~/server/db'
import { artists, invoices } from '~/server/db/schema'
import {
    InvoiceStatus,
    PurchaseType,
    type StripePaymentMetadata
} from '~/core/structures'
import { novu } from '~/server/novu'
import { clerkClient } from '@clerk/nextjs/server'
import { revalidateTag } from 'next/cache'

export async function POST(req: Request) {
    const sig = req.headers.get('stripe-signature')

    if (!req.body || !sig) {
        return NextResponse.error()
    }

    let event: Stripe.Event
    try {
        event = Stripe.webhooks.constructEvent(
            await req.text(),
            sig,
            env.STRIPE_WEHBOOK_SECRET
        )
    } catch (err) {
        console.error('Error constructing event:', err)

        return NextResponse.error()
    }

    switch (event.type) {
        case 'invoice.paid':
            {
                const invoice = event.data.object
                const metadata = invoice.metadata as unknown as StripePaymentMetadata

                if (
                    metadata.purchase_type !== PurchaseType.CommissionInvoice ||
                    metadata.invoice_id === undefined
                ) {
                    console.log(metadata)
                    return NextResponse.error()
                }

                // Update invoice status
                await db
                    .update(invoices)
                    .set({
                        status: InvoiceStatus.Paid
                    })
                    .where(eq(invoices.id, metadata.invoice_id))

                // Get full invoice object
                const db_invoice = await db.query.invoices.findFirst({
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

                if (!db_invoice) {
                    throw new Error('Invoice not found')
                }

                // Notify artist that invoice has been paid
                await novu.trigger('invoice-paid', {
                    to: {
                        subscriberId: db_invoice?.artist.user_id
                    },
                    payload: {
                        commission_title: db_invoice?.request.commission.title,
                        username: (await clerkClient.users.getUser(db_invoice.user_id))
                            .username!
                    }
                })
            }
            break
        case 'customer.subscription.created':
            {
                // Get the user from the metadata
                const subscription = event.data.object

                // Update the artist's subscription status
                await db
                    .update(artists)
                    .set({
                        supporter: true
                    })
                    .where(eq(artists.zed_customer_id, subscription.customer as string))

                // Invalidate dashboard cache
                revalidateTag('artist_data')
            }
            break
        case 'customer.subscription.deleted':
            {
                // Get the user from the metadata
                const subscription = event.data.object

                // Update the artist's subscription status
                await db
                    .update(artists)
                    .set({
                        supporter: false
                    })
                    .where(eq(artists.zed_customer_id, subscription.customer as string))

                // Invalidate dashboard cache
                revalidateTag('artist_data')
            }
            break
    }

    return NextResponse.json({ handled: true })
}
