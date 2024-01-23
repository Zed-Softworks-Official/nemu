import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

import { S3Delete } from '@/core/storage'
import { AWSLocations } from '@/core/structures'
import { NemuResponse, StatusCode } from '@/core/responses'
import { StripeGetRawProductInfo, StripeUpdateProduct } from '@/core/payments'

/**
 * Handles deletion of an image from a product
 *
 * @prop {string} id - The id of the proudct
 * @prop {string} image_key - The index of the image inside of the stripe array
 */
export async function POST(
    req: Request,
    { params }: { params: { id: string; image_key: string } }
) {
    // Get Product
    const db_product = await prisma.storeItem.findFirst({
        where: {
            product: params.id
        }
    })

    // Get the product from stripe
    const product = await StripeGetRawProductInfo(
        db_product?.product!,
        db_product?.stripeAccId!
    )

    // Check if there are images
    if (!product.images) {
        // return failed response
        return NextResponse.json<NemuResponse>({
            status: StatusCode.InternalError,
            message: 'No images are available for this product!'
        })
    }

    // Delete the image
    const deleted_images = product.images.splice(Number(params.image_key), 1)

    // Update on stripe
    await StripeUpdateProduct(
        db_product?.product!,
        {
            images: product.images
        },
        db_product?.stripeAccId!
    )

    // Get Artist
    const artist = await prisma.artist.findFirst({
        where: {
            userId: db_product?.userId
        }
    })

    // Delete on AWS
    await S3Delete(artist?.handle!, AWSLocations.Store, deleted_images[0])

    // Return success response
    return NextResponse.json<NemuResponse>({
        status: StatusCode.Success,
        message: 'Item Deleted Successfully'
    })
}
