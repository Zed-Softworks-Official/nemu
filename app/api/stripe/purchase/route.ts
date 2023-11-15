import { NextResponse } from 'next/server'

import { PurchasePageRequest } from '@/helpers/api/request-inerfaces'
import { StripeGetPurchasePage, StripeGetRawProductInfo } from '@/helpers/stripe'

export async function POST(req: Request) {
    const formData = await req.formData()

    // Check if theres a payload
    if (!formData) {
        return NextResponse.json({
            success: false
        })
    }

    const data: PurchasePageRequest = {
        product_id: formData.get('product_id')?.toString()!,
        stripe_account: formData.get('stripe_account')?.toString()!
    }

    // Get the product
    const product = await StripeGetRawProductInfo(data.product_id, data.stripe_account)

    // Redirect User
    return NextResponse.redirect((await StripeGetPurchasePage(product, data.stripe_account)).url!)
}
