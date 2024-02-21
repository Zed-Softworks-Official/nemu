import { stripe } from '@/lib/stripe'

export async function StripeCreatePrice(
    amount: number,
    stripe_account: string,
    product_id?: string
) {
    return await stripe.prices.create(
        {
            currency: 'usd',
            unit_amount: amount * 100,
            product: product_id
        },
        {
            stripeAccount: stripe_account
        }
    )
}

/**
 * Finds the price info for a given price from a stripe account
 *
 * @param {string} price_id - The price id of the requested price
 * @param {string} stripe_account - The stripe account to find the price information
 * @returns A price object from stripe
 */
export async function StripeGetPriceInfo(price_id: string, stripe_account: string) {
    return await stripe.prices.retrieve(price_id, {
        stripeAccount: stripe_account
    })
}

/**
 * Collects all prices for a given stripe account
 *
 * @param {string} stripe_account - The stripe id to gather all of the prices
 * @returns A list of all prices for a given account
 */
export async function StripeGetPrices(stripe_account: string) {
    return await stripe.prices.list(
        {},
        {
            stripeAccount: stripe_account
        }
    )
}