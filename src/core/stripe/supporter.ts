import { stripe } from '~/server/stripe'
import { PurchaseType } from '~/core/structures'
import { env } from '~/env'

/**
 *
 * @param artist_id - The artist id of the user
 * @param term - The length of how long they want the renewal
 * @param customer - The customer id of the user so we can autofil data
 */
export async function StripeCreateSupporterCheckout(
    artist_id: string,
    term: 'monthly' | 'annual',
    customer: string
) {
    return await stripe.checkout.sessions.create({
        line_items: [
            {
                price:
                    term === 'monthly'
                        ? 'price_1P3VzqBUuzvTmMJLlGYGW4Qb'
                        : 'price_1P3VzqBUuzvTmMJLwJHOoLzn',
                quantity: 1
            }
        ],
        mode: 'subscription',
        customer,

        ui_mode: 'hosted',
        success_url: env.BASE_URL + '/artists/supporter/success',
        cancel_url: env.BASE_URL + '/artists/supporter',
        metadata: {
            artist_id,
            purchase_type: PurchaseType.Supporter
        }
    })
}

/**
 *
 * @param customer_id - Customer id to get the billing portal for
 * @returns
 */
export async function StripeCreateSupporterBilling(customer_id: string) {
    return await stripe.billingPortal.sessions.create({
        customer: customer_id
    })
}