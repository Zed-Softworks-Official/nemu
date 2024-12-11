import type Stripe from 'stripe'
import { stripe } from '~/server/stripe'

import {
    type StripePaymentMetadata,
    PurchaseType,
    type StripeProductCheckoutData
} from '~/lib/structures'
import { calculate_application_fee } from '~/lib/payments'

export async function StripeCreateProductPaymentIntent(
    checkout_data: StripeProductCheckoutData
) {
    const metadata: StripePaymentMetadata = {
        user_id: checkout_data.user_id,
        product_id: checkout_data.product_id,
        artist_id: checkout_data.artist_id,
        purchase_type: PurchaseType.ArtistCorner
    }

    // TODO: Add Title of commission to payment intent
    return await stripe.paymentIntents.create(
        {
            amount: checkout_data.price,
            currency: 'usd',
            customer: checkout_data.customer_id,
            payment_method_types: ['card', 'link'],
            application_fee_amount:
                checkout_data.supporter === false
                    ? calculate_application_fee(checkout_data.price)
                    : undefined,
            metadata: metadata as unknown as Stripe.MetadataParam
        },
        {
            stripeAccount: checkout_data.stripe_account
        }
    )
}
