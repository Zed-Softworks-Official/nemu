import { stripe } from '~/server/stripe'
import { PurchaseType, StripePaymentMetadata } from '~/core/structures'
import Stripe from 'stripe'

/**
 * 
 * @param {string} stripe_account - The connect account id
 * @param opts - The options for the stripe invoice 
 * @return {Promise<Stripe.Invoice>} - The stripe invoice object
 */
export async function StripeCreateInvoice(
    stripe_account: string,
    opts: {
        customer_id: string
        user_id: string
        order_id: string
        commission_id: string
    }
) {
    const metadata: StripePaymentMetadata = {
        purchase_type: PurchaseType.CommissionInvoice,
        user_id: opts.user_id,
        commission_id: opts.commission_id,
        order_id: opts.order_id
    }

    return await stripe.invoices.create(
        {
            customer: opts.customer_id,
            metadata: metadata as unknown as Stripe.MetadataParam
        },
        { stripeAccount: stripe_account }
    )
}
