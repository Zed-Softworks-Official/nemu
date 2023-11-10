import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { StripeGetStoreProductInfo } from '@/helpers/stripe'

/**
 * Gets a product from a particular user using a product id and a user id
 */
export async function GET(
    req: Request,
    { params }: { params: { id: string; product_id: string } }
) {
    const product = await prisma.storeItem.findFirst({
        where: {
            product: params.product_id
        }
    })

    return NextResponse.json({
        product: await StripeGetStoreProductInfo(product?.product!, product?.stripeAccId!)
    })
}
