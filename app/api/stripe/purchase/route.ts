import { NextResponse } from 'next/server'

import { StripeGetPurchasePage, StripeGetRawProductInfo } from '@/helpers/stripe'
import {
    NemuResponse,
    PurchasePageData,
    StatusCode
} from '@/helpers/api/request-inerfaces'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
    const formData = await req.formData()

    // Check if theres a payload
    if (!formData) {
        return NextResponse.json<NemuResponse>({
            status: StatusCode.InternalError,
            message: 'No form payload!'
        })
    }

    const data: PurchasePageData = {
        product_id: formData.get('product_id')?.toString()!,
        stripe_account: formData.get('stripe_account')?.toString()!,
        user_id: formData.get('user_id')?.toString()!
    }

    // Get the product
    const product = await StripeGetRawProductInfo(data.product_id, data.stripe_account)

    // Create checkout session
    const checkout_session = await StripeGetPurchasePage(product, data.stripe_account)

    // Save checkout session to database
    await prisma.checkoutSession.create({
        data: {
            userId: data.user_id,
            productId: data.product_id,
            sessionId: checkout_session.id,
            stripeAccId: data.stripe_account
        }
    })

    // Redirect User
    return NextResponse.redirect(checkout_session.url!, StatusCode.Redirect)
}
