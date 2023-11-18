import Stripe from 'stripe'

import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

import { StripeGetRawProductInfo } from '@/helpers/stripe'
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

    // Check to see which values have been updated
    let updated_values: Stripe.ProductUpdateParams
    formData.forEach((value, key) => {
        console.log(`${key}: ${value}`)
    })

    return NextResponse.json<NemuResponse>({
        status: StatusCode.Success
    })
}
