import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { StripeGetStoreProductInfo } from '@/helpers/stripe'
import { ProductRequest, ShopResponse, StatusCode } from '@/helpers/api/request-inerfaces'

/**
 * Gets a product from a particular user using a product id
 */
export async function POST(req: Request) {
    // Get product information
    const data = (await req.json()) as ProductRequest

    // Get product from database
    const product = await prisma.storeItem.findFirst({
        where: {
            product: data.product_id
        }
    })

    // Check if the product exists
    if (!product) {
        return NextResponse.json<ShopResponse>({
            status: StatusCode.InternalError,
            message: 'Invalid Product Id'
        })
    }

    // Check if the user actually purchased the item
    

    return NextResponse.json<ShopResponse>({
        status: StatusCode.Success,
        product: await StripeGetStoreProductInfo(
            product?.product!,
            product?.stripeAccId!,
            data.purchased
        )
    })
}
