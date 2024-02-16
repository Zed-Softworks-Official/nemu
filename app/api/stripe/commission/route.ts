import {
    StripeCreateCommissionCheckoutSession,
    StripeCreateCommissionSetupIntent,
    StripeGetCommissionProduct
} from '@/core/stripe/commissions'
import { StripeCommissionCheckoutData } from '@/core/structures'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
    const data = (await req.json()) as { checkout_data: StripeCommissionCheckoutData }

    // TODO: Check if invoicing
    const commission_product = await StripeGetCommissionProduct(
        data.checkout_data.product_id,
        data.checkout_data.stripe_account
    )

    const checkout_session = await StripeCreateCommissionSetupIntent(
        data.checkout_data,
        commission_product.price,
        commission_product.product
    )

    return NextResponse.json({
        clientSecret: checkout_session.client_secret
    })
}
