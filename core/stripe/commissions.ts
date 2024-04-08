import Stripe from 'stripe'

import { stripe } from '@/lib/stripe'
import {
    CommissionItem,
    InvoiceCommissionItem,
    PurchaseType,
    StripePaymentMetadata
} from '../structures'
import { StripeGetPriceInfo } from './prices'
import { CalculateApplicationFee } from '../payments'
import { InvoiceItem } from '@prisma/client'

////////////////////////////////////////
// Custom (Invoiced) Commissions
////////////////////////////////////////

export async function StripeCreateCommissionInvoice(
    customer: string,
    stripe_account: string,
    user_id: string,
    order_id: string,
    commission_id: string
) {
    const metadata: StripePaymentMetadata = {
        purchase_type: PurchaseType.CommissionInvoice,
        user_id: user_id,
        order_id: order_id,
        commission_id: commission_id
    }

    return await stripe.invoices.create(
        {
            customer: customer,
            metadata: metadata as unknown as Stripe.MetadataParam
        },
        {
            stripeAccount: stripe_account
        }
    )
}

/**
 *
 * @param customer
 * @param stripe_account
 * @param invoice_id
 * @param days_until_due
 * @param items
 */
export async function StripeUpdateCommissionInvoice(
    customer: string,
    stripe_account: string,
    invoice_id: string,
    items: InvoiceItem[],
    supporter: boolean,
    days_until_due?: number
) {
    // Clear Invoice items if any
    const line_items = await stripe.invoices.listLineItems(invoice_id, {
        stripeAccount: stripe_account
    })
    if (line_items.data.length != 0) {
        for (const line_item of line_items.data) {
            await stripe.invoiceItems.del(line_item.id, undefined, {
                stripeAccount: stripe_account
            })
        }
    }

    // Add invoice items
    let total_price = 0
    for (const item of items) {
        total_price += item.price * item.quantity
        await stripe.invoiceItems.create(
            {
                customer: customer,
                unit_amount: item.price * 100,
                description: item.name,
                quantity: item.quantity,
                invoice: invoice_id
            },
            { stripeAccount: stripe_account }
        )
    }

    // Add Application fee to invoice
    await stripe.invoices.update(
        invoice_id,
        {
            application_fee_amount:
                supporter === false
                    ? CalculateApplicationFee(total_price) * 100
                    : undefined,
            days_until_due: days_until_due
        },
        { stripeAccount: stripe_account }
    )
}

/**
 *
 * @param stripe_account
 * @param invoice_id
 * @returns
 */
export async function StripeFinalizeCommissionInvoice(
    invoice_id: string,
    stripe_account: string
) {
    return await stripe.invoices.finalizeInvoice(invoice_id, {
        stripeAccount: stripe_account
    })
}
