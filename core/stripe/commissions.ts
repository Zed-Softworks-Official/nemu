import Stripe from 'stripe'

import { stripe } from '@/lib/stripe'
import { CommissionItem } from '../structures'
import { CalculateApplicationFee } from './payments'
import { StripeGetPriceInfo } from './prices'

/**
 *
 * @param {string} stripe_account
 * @param {CommissionItem} commission
 * @returns
 */
export async function StripeCreateCommissionProduct(
    stripe_account: string,
    commission: CommissionItem
) {
    return await stripe.products.create(
        {
            name: commission.title,
            description: commission.description,
            default_price_data: {
                currency: 'usd',
                unit_amount: commission.price * 100
            }
        },
        {
            stripeAccount: stripe_account
        }
    )
}

/**
 *
 * @param {string} stripe_account
 * @param {string} customer
 * @param {string} commission
 * @returns
 */
export async function StripeCreateCommissionInvoice(
    stripe_account: string,
    customer: string,
    commission: CommissionItem
) {
    return await stripe.invoices.create(
        {
            customer: customer,
            collection_method: 'send_invoice',
            application_fee_amount: CalculateApplicationFee(commission.price)
        },
        {
            stripeAccount: stripe_account
        }
    )
}

export async function StripeGetCommissionProduct(
    product_id: string,
    stripe_account: string
) {
    const product = await stripe.products.retrieve(product_id, {
        stripeAccount: stripe_account
    })

    return {
        price:
            (await StripeGetPriceInfo(product.default_price!.toString(), stripe_account))
                .unit_amount! / 100,
        product: product
    }
}
