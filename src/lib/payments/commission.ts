import { stripe } from '~/server/stripe'
import { type InvoiceItem, type StripePaymentMetadata } from '~/lib/types'
import { calculateApplicationFee } from '.'

/**
 * Creates a new commission invoice for the given commission
 *
 * @param {string} stripeAccount - The connect account id
 * @param {string} customerId - The customer id of the user
 * @param {string} orderId - The order id of the commission
 * @returns {Promise<Stripe.Invoice>} - The stripe invoice object
 */
export async function StripeCreateInvoice(
    stripeAccount: string,
    customerId: string,
    orderId: string
) {
    return await stripe.invoices.create(
        {
            customer: customerId,
            metadata: {
                purchaseType: 'commission_invoice',
                orderId,
                stripeAccount
            } satisfies StripePaymentMetadata
        },
        { stripeAccount: stripeAccount }
    )
}

/**
 * Updates the existing invoice items for a given invoice id
 *
 * @param {string} customerId - The customer id of the user
 * @param {string} stripeAccount - The stripe account id
 * @param {string} invoiceStripeId - The invoice id to update
 * @param {InvoiceItem[]} items - The items to add to the invoice
 * @param {boolean} supporter - Whether the artist is a supporter or not
 */
export async function StripeUpdateInvoice(
    customerId: string,
    stripeAccount: string,
    invoiceStripeId: string,
    items: InvoiceItem[],
    downpayment?: {
        index: number
        percentage: number
    }
) {
    // Clear the invoice items if any
    const lineItems = await stripe.invoices.listLineItems(invoiceStripeId, {
        stripeAccount: stripeAccount
    })

    if (lineItems.data.length > 0) {
        for (const lineItem of lineItems.data) {
            await stripe.invoiceItems.del(lineItem.id, {
                stripeAccount: stripeAccount
            })
        }
    }

    // Add invoice items
    for (const item of items) {
        await stripe.invoiceItems.create(
            {
                customer: customerId,
                unit_amount: item.price,
                quantity: item.quantity,
                invoice: invoiceStripeId,
                description: item.name
            },
            { stripeAccount: stripeAccount }
        )
    }

    // Add downpayment discount if there is one
    if (downpayment && downpayment.index === 0) {
        const stripeDiscount = await stripe.coupons.create(
            {
                percent_off: Math.abs(downpayment.percentage - 100),
                duration: 'once',
                max_redemptions: 1
            },
            { stripeAccount: stripeAccount }
        )

        await stripe.invoices.update(
            invoiceStripeId,
            {
                discounts: [
                    {
                        coupon: stripeDiscount.id
                    }
                ]
            },
            { stripeAccount: stripeAccount }
        )
    } else if (downpayment && downpayment.index === 1) {
        const stripeDiscount = await stripe.coupons.create(
            {
                percent_off: downpayment.percentage,
                duration: 'once',
                max_redemptions: 1
            },
            {
                stripeAccount: stripeAccount
            }
        )

        await stripe.invoices.update(
            invoiceStripeId,
            {
                discounts: [
                    {
                        coupon: stripeDiscount.id
                    }
                ]
            },
            {
                stripeAccount: stripeAccount
            }
        )
    }
}

/**
 * Finalizes the invoice and sends it to the user
 *
 * @param {string} invoiceStripeId - The invoice id to finalize
 * @param {string} stripeAccount - The stripe account id
 * @returns {Promise<Stripe.Invoice>} - The finalized invoice object
 */
export async function StripeFinalizeInvoice(
    invoiceStripeId: string,
    stripeAccount: string,
    supporter: boolean
) {
    const invoice = await stripe.invoices.retrieve(invoiceStripeId, {
        stripeAccount: stripeAccount
    })

    // Add Application fee to invoice
    let applicationFeeAmount: number | undefined
    if (!supporter) {
        applicationFeeAmount = Math.floor(calculateApplicationFee(invoice.amount_due))
    }

    // Set the due date to 48 hours from now
    await stripe.invoices.update(
        invoiceStripeId,
        {
            collection_method: 'send_invoice',
            days_until_due: 2,
            application_fee_amount: applicationFeeAmount,
            payment_settings: {
                payment_method_types: ['card', 'link']
            }
        },
        { stripeAccount: stripeAccount }
    )

    return await stripe.invoices.finalizeInvoice(invoiceStripeId, {
        stripeAccount: stripeAccount
    })
}
