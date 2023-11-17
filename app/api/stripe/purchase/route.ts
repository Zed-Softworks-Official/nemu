import { NextResponse } from 'next/server'

import { StripeGetPurchasePage, StripeGetRawProductInfo } from '@/helpers/stripe'
import {
    NemuResponse,
    PurchasePageData,
    StatusCode
} from '@/helpers/api/request-inerfaces'

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
        stripe_account: formData.get('stripe_account')?.toString()!
    }

    // Get the product
    const product = await StripeGetRawProductInfo(data.product_id, data.stripe_account)

    // Redirect User
    return NextResponse.redirect(
        (await StripeGetPurchasePage(product, data.stripe_account)).url!,
        302
    )
}
