import { Stripe } from 'stripe'

import { stripe } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'
import { CalculateApplicationFee } from '../payments'

/**
 * Creates a stripe checkout session for a given product
 *
 * @param {Stripe.Product} product - The product to get the stripe
 * @param {string} stripe_account - The stripe account for the product
 * @param {string} customer_id - The stripe customer id for the customer
 * @returns A stripe checkout session
 */
export async function StripeGetPurchasePage(
    product: Stripe.Product,
    stripe_account: string,
    customer_id: string,
    user_id: string,
    amount: number
) {
    const artist = await prisma.artist.findFirst({
        where: {
            stripeAccId: stripe_account
        }
    })

    return await stripe.checkout.sessions.create(
        {
            line_items: [
                {
                    price: product.default_price!.toString(),
                    quantity: 1
                }
            ],
            payment_intent_data: {
                application_fee_amount: CalculateApplicationFee(amount)
            },
            metadata: {
                stripe_account: stripe_account,
                product_id: product.id,
                user_id: user_id
            },
            customer: customer_id,
            mode: 'payment',
            success_url: `${process.env.BASE_URL}/payments/success`,
            cancel_url: `${process.env.BASE_URL}/@${artist?.handle}`
        },
        {
            stripeAccount: stripe_account
        }
    )
}

/**
 * Gets a specified checkout session
 *
 * @param {string} session_id - Checkout session id
 * @param {string} stripe_account - Stripe account associated with checkout session
 * @returns A Stripe checkout session
 */
export async function StripeGetCheckoutSession(
    session_id: string,
    stripe_account: string
) {
    return await stripe.checkout.sessions.retrieve(session_id, {
        stripeAccount: stripe_account
    })
}
