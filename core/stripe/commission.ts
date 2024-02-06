import Stripe from 'stripe'

import { stripe } from '@/lib/stripe'
import { CommissionItem } from '../structures'

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
