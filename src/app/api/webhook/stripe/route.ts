import Stripe from 'stripe'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { env } from '~/env'
import { db } from '~/server/db'
import { invoices } from '~/server/db/schema'
import { InvoiceStatus, PurchaseType, StripePaymentMetadata } from '~/core/structures'

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
                const invoice = event.data.object as Stripe.Invoice
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
            }
            break
    }

    return NextResponse.json({ handled: true })
}
