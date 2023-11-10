import { AWSLocations, S3Upload } from '@/helpers/s3'
import { StripeCreateStoreProduct, StripeGetStoreProductInfo } from '@/helpers/stripe'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

/**
 * Creates a product on stripe, our database, and uploads the data files to S3
 *
 * @param id - The ID for the
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
    const data = await req.formData()

    // Get User Id
    const artist = await prisma.artist.findFirst({
        where: {
            stripeAccId: params.id
        }
    })

    // Upload Featured Image
    const featured_image = crypto.randomUUID()
    await S3Upload(
        artist?.handle!,
        AWSLocations.Store,
        data.get('featured_image') as File,
        featured_image
    )

    // Upload Asset File
    const asset = crypto.randomUUID()
    await S3Upload(
        artist?.handle!,
        AWSLocations.StoreDownload,
        data.get('download_file') as File,
        asset
    )

    // Upload The Rest of the Images
    // Check if we have extra files

    /*
    let object: Record<string, any> = {}
    data.forEach((value, key) => object[key] = value)
    console.log(data.getAll('product_images'))
    */

    // Create the Stripe Product
    const product = await StripeCreateStoreProduct(params.id, {
        name: data.get('product_name')?.toString()!,
        description: data.get('product_description')?.toString()!,
        price: Number(data.get('product_price')?.toString()!),
        featured_image: featured_image,
        asset: asset
    })

    // Create The Item in The database
    await prisma.storeItem.create({
        data: {
            userId: artist?.userId!,
            stripeAccId: params.id,
            product: product.id
        }
    })

    return NextResponse.json({
        success: true
    })
}

/**
 * Gets all the products from a particular user
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
    const product = await prisma.storeItem.findFirst({
        where: {
            userId: params.id
        }
    })

    return NextResponse.json({
        product: await StripeGetStoreProductInfo(product?.product!, product?.stripeAccId!)
    })
}
