import Stripe from 'stripe'

import { stripe } from '@/lib/stripe'
import {
    CommissionItem,
    PurchaseType,
    StripeCommissionCheckoutData,
    StripePaymentMetadata
} from '../structures'
import { StripeGetPriceInfo } from './prices'
import { CalculateApplicationFee } from '../payments'

////////////////////////////////////////
// Your Character Here Type Commissions
////////////////////////////////////////

/**
 *
 * @param checkout_data
 * @param amount
 * @param commission
 * @returns
 */
export async function StripeCreateCommissionPaymentIntent(
    checkout_data: StripeCommissionCheckoutData
) {
    const metadata: StripePaymentMetadata = {
        user_id: checkout_data.user_id,
        purchase_type: PurchaseType.CommissionSetupPayment,
        form_id: checkout_data.form_id,
        form_content: checkout_data.form_content
    }

    // TODO: Add Title of commission to payment intent
    return await stripe.paymentIntents.create(
        {
            amount: checkout_data.price * 100,
            currency: 'usd',
            customer: checkout_data.customer_id,
            payment_method_types: ['card', 'link'],
            payment_method_options: {
                card: {
                    capture_method: 'manual'
                },
                link: {
                    capture_method: 'manual'
                }
                // paypal: {
                //     capture_method: 'manual'
                // }
            },
            application_fee_amount: CalculateApplicationFee(checkout_data.price) * 100,
            metadata: metadata as unknown as Stripe.MetadataParam
        },
        {
            stripeAccount: checkout_data.stripe_account
        }
    )
}

/**
 *
 * @param payment_intent
 * @param stripe_account
 * @returns
 */
export async function StripeAcceptCommissionPaymentIntent(
    payment_intent: string,
    stripe_account: string
) {
    return await stripe.paymentIntents.capture(payment_intent, {
        stripeAccount: stripe_account
    })
}

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
 * @param {string} product_id
 * @param {string} stripe_account
 * @returns
 */
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

////////////////////////////////////////
// Custom (Invoiced) Commissions
////////////////////////////////////////

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
