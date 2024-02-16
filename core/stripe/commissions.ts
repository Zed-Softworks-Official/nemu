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
import { metadata } from '@/app/layout'

////////////////////////////////////////
// Your Character Here Type Commissions
////////////////////////////////////////

export async function StripeCreateCommissionSetupIntent(
    checkout_data: StripeCommissionCheckoutData,
    amount: number,
    commission: Stripe.Product
) {
    const metadata: StripePaymentMetadata = {
        user_id: checkout_data.user_id,
        product_id: commission.id,
        purchase_type: PurchaseType.CommissionSetupPayment,
        form_id: checkout_data.form_id,
        form_content: checkout_data.form_content
    }

    return await stripe.setupIntents.create(
        {
            customer: checkout_data.customer_id,
            metadata: metadata as unknown as Stripe.MetadataParam
        },
        {
            stripeAccount: checkout_data.stripe_account
        }
    )
}

export async function StripeCreateCommissionCheckoutSession(
    checkout_data: StripeCommissionCheckoutData,
    amount: number,
    commission: Stripe.Product
) {
    const metadata: StripePaymentMetadata = {
        user_id: checkout_data.user_id,
        product_id: commission.id,
        purchase_type: PurchaseType.CommissionSetupPayment,
        form_id: checkout_data.form_id,
        form_content: checkout_data.form_content
    }

    return await stripe.checkout.sessions.create(
        {
            mode: 'setup',
            customer: checkout_data.customer_id,
            ui_mode: 'embedded',
            metadata: metadata as unknown as Stripe.MetadataParam,
            // payment_intent_data: {
            //     application_fee_amount: CalculateApplicationFee(amount)
            // },
            currency: 'usd',
            return_url: checkout_data.return_url
        },
        {
            stripeAccount: checkout_data.stripe_account
        }
    )
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
