import Stripe from 'stripe'

import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

import { StripeGetPriceInfo, StripeGetRawProductInfo, StripeUpdateProduct } from '@/helpers/stripe'
import { NemuResponse, StatusCode } from '@/helpers/api/request-inerfaces'

/**
 * Updates an item based on a given product id
 * 
 * @param id - the product id
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
    // Get the form data
    const formData = await req.formData()

    // Pull the product data from our database
    const db_product = await prisma.storeItem.findFirst({
        where: {
            product: params.id
        }
    })

    // Get the product from stripe
    const product = await StripeGetRawProductInfo(db_product?.product!, db_product?.stripeAccId!)

    // Get price information
    const price = (await StripeGetPriceInfo(product.default_price?.toString()!, db_product?.stripeAccId!)).unit_amount

    // Check to see which values have been updated
    let updated_values: Stripe.ProductUpdateParams = {}
    formData.forEach((value, key) => {
        switch (key) {
            case 'product_name':
                updated_values.name = value != product.name ? value as string : undefined
                break
            case 'product_description':
                //updated_values.description = value != product.description ? value as string : product.description
                break
            case 'product_price':
                console.log((price! / 100).toPrecision(2))
                break
        }
    })

    // Update changed values on stripe
    await StripeUpdateProduct(db_product?.product!, updated_values, db_product?.stripeAccId!)

    return NextResponse.json<NemuResponse>({
        status: StatusCode.Success
    })
}
