import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

import { StripeGetStoreProductInfo } from '@/helpers/stripe'
import { ShopItem, ShopResponse, StatusCode } from '@/helpers/api/request-inerfaces'

/**
 * Gets all the products from a particular user
 *
 * @param id - The ID for the user
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
    const products = await prisma.storeItem.findMany({
        where: {
            userId: params.id
        }
    })

    let result: ShopItem[] = []
    for (let i = 0; i < products.length; i++) {
        result.push(
            await StripeGetStoreProductInfo(
                products[i]?.product!,
                products[i]?.stripeAccId!
            )
        )
    }

    return NextResponse.json<ShopResponse>({
        status: StatusCode.Success,
        products: result
    })
}
