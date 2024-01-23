import { NextResponse } from 'next/server'
import { NemuResponse, StatusCode } from '@/core/responses'
import { prisma } from '@/lib/prisma'
import { StripeDeleteProduct, StripeGetRawProductInfo } from '@/core/payments'
import { S3Delete } from '@/core/storage'
import { AWSLocations } from '@/core/structures'

export async function POST(req: Request, { params }: { params: { id: string } }) {
    // Get product from database
    const db_product = await prisma.storeItem.findFirst({
        where: {
            product: params.id
        }
    })

    // Check if product exists
    if (!db_product) {
        return NextResponse.json<NemuResponse>({
            status: StatusCode.InternalError,
            message: 'Invalid Product Id'
        })
    }

    // Get product from Stripe
    const product = await StripeGetRawProductInfo(
        db_product.product,
        db_product.stripeAccId
    )

    // Check if the product exists
    if (!product) {
        return NextResponse.json<NemuResponse>({
            status: StatusCode.InternalError,
            message: 'Invalid Product'
        })
    }

    // Get Artist
    const artist = await prisma.artist.findFirst({
        where: {
            userId: db_product.userId
        }
    })

    // Delete images from S3 if there are any
    if (product.images.length != 0) {
        for (let i = 0; i < product.images.length; i++) {
            await S3Delete(artist?.handle!, AWSLocations.Store, product.images[i])
        }
    }

    // Delete Featured Image from S3
    await S3Delete(artist?.handle!, AWSLocations.Store, product.metadata.featured_image)

    // Delete Asset From S3
    await S3Delete(artist?.handle!, AWSLocations.StoreDownload, product.metadata.asset)

    // Delete from Stripe
    const stripe_response = await StripeDeleteProduct(
        db_product.product,
        db_product.stripeAccId
    )

    // Check if the deletion was successful
    if (stripe_response.active) {
        return NextResponse.json<NemuResponse>({
            status: StatusCode.InternalError,
            message: 'Failed To Delete Item From Stripe!'
        })
    }

    // Delete data from database
    await prisma.storeItem.delete({
        where: {
            id: db_product.id
        }
    })

    return NextResponse.json<NemuResponse>({
        status: StatusCode.Success
    })
}
