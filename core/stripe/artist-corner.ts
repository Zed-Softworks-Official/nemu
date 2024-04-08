import Stripe from 'stripe'
import { stripe } from '@/lib/stripe'

import {
    StripePaymentMetadata,
    PurchaseType,
    StripeProductCheckoutData
} from '../structures'
import { CalculateApplicationFee } from '../payments'

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
            amount: checkout_data.price * 100,
            currency: 'usd',
            customer: checkout_data.customer_id,
            payment_method_types: ['card', 'link'],
            application_fee_amount:
                checkout_data.supporter === false
                    ? CalculateApplicationFee(checkout_data.price) * 100
                    : undefined,
            metadata: metadata as unknown as Stripe.MetadataParam
        },
        {
            stripeAccount: checkout_data.stripe_account
        }
    )
}
