import { stripe } from '~/server/stripe'
import {
    type InvoiceItem,
    PurchaseType,
    type StripePaymentMetadata
} from '~/lib/structures'
import type Stripe from 'stripe'
import { calculate_application_fee } from '.'

/**
 * Creates a new commission invoice for the given commission
 *
 * @param {string} stripe_account - The connect account id
 * @param opts - The options for the stripe invoice
 * @return {Promise<Stripe.Invoice>} - The stripe invoice object
 */
export async function StripeCreateInvoice(
    stripe_account: string,
    opts: {
        customer_id: string
        user_id: string
        order_id: string
        commission_id: string
        invoice_id: string
        artist_id: string
    }
) {
    const metadata: StripePaymentMetadata = {
        purchase_type: PurchaseType.CommissionInvoice,
        user_id: opts.user_id,
        commission_id: opts.commission_id,
        order_id: opts.order_id,
        invoice_id: opts.invoice_id,
        artist_id: opts.artist_id
    }

    return await stripe.invoices.create(
        {
            customer: opts.customer_id,
            metadata: metadata as unknown as Stripe.MetadataParam
        },
        { stripeAccount: stripe_account }
    )
}

/**
 * Updates the existing invoice items for a given invoice id
 *
 * @param {string} customer_id - The customer id of the user
 * @param {string} stripe_account - The stripe account id
 * @param {string} invoice_id - The invoice id to update
 * @param {InvoiceItem[]} items - The items to add to the invoice
 * @param {boolean} supporter - Whether the artist is a supporter or not
 */
export async function StripeUpdateInvoice(
    customer_id: string,
    stripe_account: string,
    invoice_stripe_id: string,
    items: InvoiceItem[],
    supporter: boolean,
    downpayment?: {
        index: number
        percentage: number
    }
) {
    // Clear the invoice items if any
    const line_items = await stripe.invoices.listLineItems(invoice_stripe_id, {
        stripeAccount: stripe_account
    })

    if (line_items.data.length > 0) {
        for (const line_item of line_items.data) {
            await stripe.invoiceItems.del(line_item.id, {
                stripeAccount: stripe_account
            })
        }
    }

    // Add invoice items
    for (const item of items) {
        await stripe.invoiceItems.create(
            {
                customer: customer_id,
                unit_amount: item.price,
                quantity: item.quantity,
                invoice: invoice_stripe_id,
                description: item.name
            },
            { stripeAccount: stripe_account }
        )
    }

    // Add downpayment discount if there is one
    if (downpayment && downpayment.index === 0) {
        const stripe_discount = await stripe.coupons.create(
            {
                percent_off: Math.abs(downpayment.percentage - 100),
                duration: 'once',
                max_redemptions: 1
            },
            { stripeAccount: stripe_account }
        )

        await stripe.invoices.update(
            invoice_stripe_id,
            {
                discounts: [
                    {
                        coupon: stripe_discount.id
                    }
                ]
            },
            { stripeAccount: stripe_account }
        )
    } else if (downpayment && downpayment.index === 1) {
        const stripe_discount = await stripe.coupons.create(
            {
                percent_off: downpayment.percentage,
                duration: 'once',
                max_redemptions: 1
            },
            {
                stripeAccount: stripe_account
            }
        )

        await stripe.invoices.update(
            invoice_stripe_id,
            {
                discounts: [
                    {
                        coupon: stripe_discount.id
                    }
                ]
            },
            {
                stripeAccount: stripe_account
            }
        )
    }

    const invoice = await stripe.invoices.retrieve(invoice_stripe_id, {
        stripeAccount: stripe_account
    })

    // Add Application fee to invoice
    if (!supporter) {
        await stripe.invoices.update(
            invoice_stripe_id,
            {
                application_fee_amount: Math.floor(
                    calculate_application_fee(invoice.amount_due)
                )
            },
            { stripeAccount: stripe_account }
        )
    }
}

/**
 * Finalizes the invoice and sends it to the user
 *
 * @param {string} invoice_id - The invoice id to finalize
 * @param {string} stripe_account - The stripe account id
 * @returns {Promise<Stripe.Invoice>} - The finalized invoice object
 */
export async function StripeFinalizeInvoice(
    invoice_stripe_id: string,
    stripe_account: string
) {
    // Set the due date to 48 hours from now
    await stripe.invoices.update(
        invoice_stripe_id,
        {
            due_date: Math.floor(Date.now() / 1000) + 48 * 60 * 60
        },
        { stripeAccount: stripe_account }
    )

    return await stripe.invoices.finalizeInvoice(invoice_stripe_id, {
        stripeAccount: stripe_account
    })
}
