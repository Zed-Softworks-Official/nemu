import { StripeCreateProductPaymentIntent } from '@/core/payments'
import { StripeProductCheckoutData } from '@/core/structures'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
    const data = (await req.json()) as { checkout_data: StripeProductCheckoutData }

    const payment_intent = await StripeCreateProductPaymentIntent(data.checkout_data)

    return NextResponse.json({
        clientSecret: payment_intent.client_secret
    })
}
