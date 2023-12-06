import { ShopResponse, StatusCode } from '@/helpers/api/request-inerfaces'
import { StripeGetStoreProductInfo } from '@/helpers/stripe'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function GET(
    req: Request,
    { params }: { params: { id: string; slug: string } }
) {
    const handle = params.id.replace('@', '')

    const db_product = await prisma.storeItem.findFirst({
        where: {
            handle: handle,
            slug: params.slug
        }
    })

    if (!db_product) {
        return NextResponse.json<ShopResponse>({
            status: StatusCode.InternalError,
            message: 'Failed to find product'
        })
    }

    return NextResponse.json<ShopResponse>({
        status: StatusCode.Success,
        product: await StripeGetStoreProductInfo(
            db_product?.product!,
            db_product?.stripeAccId!
        ),
        stripe_id: db_product.stripeAccId
    })
}
