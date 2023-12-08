import { NextResponse } from 'next/server'

import {
    StripeCreateCustomer,
    StripeGetCustomer,
    StripeGetPriceInfo,
    StripeGetPurchasePage,
    StripeGetRawProductInfo
} from '@/helpers/stripe'
import {
    NemuResponse,
    PurchasePageData,
    StatusCode
} from '@/helpers/api/request-inerfaces'
import { prisma } from '@/lib/prisma'
import Stripe from 'stripe'

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

    // Get Price
    const price = (
        await StripeGetPriceInfo(product.default_price?.toString()!, data.stripe_account)
    ).unit_amount

    // Get the customer user from our database
    const user = await prisma.user.findFirst({
        where: {
            id: data.user_id
        }
    })

    let customer: Stripe.Customer | undefined

    // Get the customer id if they have one
    if (!user?.customer_id) {
        // Create on if they dont
        customer = await StripeCreateCustomer(
            data.stripe_account,
            user?.name!,
            user?.id!,
            user?.email as string | undefined
        )

        // Update the user with their customer id
        await prisma.user.update({
            where: {
                id: data.user_id
            },
            data: {
                customer_id: customer.id
            }
        })
    } else {
        customer = (await StripeGetCustomer(
            data.stripe_account,
            user.customer_id
        )) as Stripe.Customer
    }

    // Create checkout session
    const checkout_session = await StripeGetPurchasePage(
        product,
        data.stripe_account,
        customer?.id!,
        price!
    )

    // Redirect User
    return NextResponse.redirect(checkout_session.url!, StatusCode.Redirect)
}
