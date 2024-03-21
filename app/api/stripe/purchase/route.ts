import { NextResponse } from 'next/server'

import {
    StripeCreateCustomer,
    StripeGetCustomer,
    StripeGetPriceInfo,
    StripeGetPurchasePage,
    StripeGetRawProductInfo
} from '@/core/payments'
import { NemuResponse, StatusCode } from '@/core/responses'
import { prisma } from '@/lib/prisma'
import Stripe from 'stripe'
import { PurchasePageData } from '@/core/structures'

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
        },
        include: {
            purchased: true
        }
    })

    // If the user has already tried to purcahse the item then retrieve it
    let customer_id = await prisma.purchased.findFirst({
        where: {
            userId: data.user_id,
            productId: data.product_id,
            stripeAccount: data.stripe_account
        }
    })

    // If we don't find a customerId from previous purchases then they are trying to purchase it for the first time
    let first_attempt = false
    if (!customer_id) {
        // Get the user and their customer ids
        customer_id = await prisma.purchased.findFirst({
            where: {
                userId: data.user_id,
                stripeAccount: data.stripe_account
            }
        })

        first_attempt = true
    }

    // Get the customer ID if they have one for the current stripe account
    let customer: Stripe.Customer | undefined
    if (!customer_id) {
        // Create on if they dont
        customer = await StripeCreateCustomer(
            data.stripe_account,
            user?.name!,
            user?.email ? user.email : undefined
        )
    } else {
        customer = (await StripeGetCustomer(
            data.stripe_account,
            customer_id.customerId
        )) as Stripe.Customer
    }

    // If this is the customers first attempt make the purchased object in our db
    if (first_attempt) {
        // Update the user with their customer id
        await prisma.user.update({
            where: {
                id: data.user_id
            },
            data: {
                purchased: {
                    create: {
                        productId: data.product_id!,
                        stripeAccount: data.stripe_account!,
                        customerId: customer.id
                    }
                }
            }
        })
    }

    // Create checkout session
    const checkout_session = await StripeGetPurchasePage(
        product,
        data.stripe_account,
        customer?.id!,
        data.user_id,
        price!
    )

    // Redirect User
    return NextResponse.redirect(checkout_session.url!, StatusCode.Redirect)
}
