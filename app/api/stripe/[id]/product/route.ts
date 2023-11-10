import { AWSLocations, S3Upload } from '@/helpers/s3'
import { StripeCreateStoreProduct, StripeGetStoreProductInfo } from '@/helpers/stripe'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

/**
 * Creates a product on stripe, our database, and uploads the data files to S3
 *
 * @param id - The ID for the user
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
    // Check if we have extra images
    let images: string[] = []
    if (data.get('product_images')) {
        // Gather All Images From Form
        const imageFiles = data.getAll('product_images') as File[]

        // Loop through and upload each file
        for (let i = 0; i < imageFiles.length; i++) {
            // Create filename
            let filename = crypto.randomUUID()

            // Upload File To S3
            await S3Upload(artist?.handle!, AWSLocations.Store, imageFiles[i], filename)

            // Assign Name to images array
            images.push(filename)
        }
    }

    images.forEach((value) => {
        console.log(value)
    })

    // Create the Stripe Product
    const product = await StripeCreateStoreProduct(params.id, {
        name: data.get('product_name')?.toString()!,
        description: data.get('product_description')?.toString()!,
        price: Number(data.get('product_price')?.toString()!),
        images: images,
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
