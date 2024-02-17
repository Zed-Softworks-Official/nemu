import {
    StripeCreateCommissionPaymentIntent,
    StripeGetCommissionProduct
} from '@/core/stripe/commissions'
import { StripeCommissionCheckoutData } from '@/core/structures'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
    const data = (await req.json()) as { checkout_data: StripeCommissionCheckoutData }

    const payment_intent = await StripeCreateCommissionPaymentIntent(
        data.checkout_data
    )

    return NextResponse.json({
        clientSecret: payment_intent.client_secret
    })
}
