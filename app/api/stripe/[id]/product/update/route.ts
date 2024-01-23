import Stripe from 'stripe'

import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

import {
    StripeCreatePrice,
    StripeGetPriceInfo,
    StripeGetPrices,
    StripeGetRawProductInfo,
    StripeUpdateProduct
} from '@/core/payments'
import { NemuResponse, StatusCode } from '@/core/responses'
import { RandomNameWithExtension, S3Delete, S3Upload } from '@/core/storage'
import { AWSLocations } from '@/core/structures'

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
    const product = await StripeGetRawProductInfo(
        db_product?.product!,
        db_product?.stripeAccId!
    )

    // Get price information
    const price = (
        await StripeGetPriceInfo(
            product.default_price?.toString()!,
            db_product?.stripeAccId!
        )
    ).unit_amount
    const all_prices = await StripeGetPrices(db_product?.stripeAccId!)

    // Create variables for new values
    const old_asset: string = product.metadata.asset
    const old_featured_image = product.metadata.featured_image
    let updated_values: Stripe.ProductUpdateParams = {}
    let new_metadata: Stripe.Metadata = product.metadata

    // Price Variables
    let create_new_price: boolean = false
    let new_price_value: number | undefined

    // Images Variables
    let image_count = product.images.length
    let new_images: string[] = []

    // Asset Variables
    let new_download = false

    // Let Featured Image
    let new_featured_image = false

    // Check to see which values have been updated
    formData.forEach((value, key) => {
        switch (key) {
            case 'product_name':
                updated_values.name =
                    value != product.name ? (value as string) : undefined
                break
            case 'product_description':
                updated_values.description =
                    value != product.description || value != '' ? (value as string) : undefined
                break
            case 'product_price':
                // Check if the price changed
                if (Number(value) != price! / 100) {
                    // Loop through all of our prices in case we have a price object with that value
                    for (let price_object of all_prices.data) {
                        // If we find a price with that value then we set the new default price to that price id
                        if (Number(value) == price_object.unit_amount! / 100) {
                            updated_values.default_price = price_object.id
                            return
                        }
                    }

                    // If we haven't found it set a flag to create a new price
                    create_new_price = true
                    new_price_value = Number(value)
                }
                break
            case 'product_images':
                const image_file = value as File
                if (image_file.size != 0 && image_count < 8) {
                    new_images.push(crypto.randomUUID())
                    image_count++
                }
                break
            case 'download_file':
                const download_file = value as File
                if (download_file.size != 0) {
                    new_download = true
                }
                break
            case 'featured_image':
                const featured_file = value as File
                if (featured_file.size != 0) {
                    new_featured_image = true
                }
                break
        }
    })

    // Create new price object if we need too
    if (create_new_price) {
        await StripeCreatePrice(
            new_price_value!,
            db_product?.product!,
            db_product?.stripeAccId!
        ).then((new_price) => {
            updated_values.default_price = new_price.id
        })
    }

    // Add new featured image if it exists
    if (new_featured_image) {
        new_metadata.featured_image = crypto.randomUUID()
        updated_values.metadata = new_metadata
    }

    // Add New Images to images array
    if (new_images.length != 0) {
        // Add new images to product
        updated_values.images = product.images.concat(new_images)
    }

    // Check if we have a new asset
    if (new_download) {
        // Get New Filename
        let filename = RandomNameWithExtension(formData.get('download_file') as File, [
            'application/zip',
            'application/x-zip-compressed'
        ])

        // Check if new file name is of the correct type
        if (filename === 'invalid') {
            return NextResponse.json<NemuResponse>({
                status: StatusCode.InternalError,
                message: 'Invalid File Type (downloadable asset must be zip)'
            })
        }

        // Add Asset Value
        new_metadata.asset = filename
        updated_values.metadata = new_metadata
    }

    // Update AWS
    if (new_download || new_featured_image || new_images.length != 0) {
        // Get Artist
        const artist = await prisma.artist.findFirst({
            where: {
                userId: db_product?.userId
            }
        })

        /////////////////////////
        // Update Download Asset
        /////////////////////////
        if (new_download) {
            // Delete Asset
            await S3Delete(
                artist?.handle!,
                AWSLocations.StoreDownload,
                old_asset
            )

            // Upload New Asset
            await S3Upload(
                artist?.handle!,
                AWSLocations.StoreDownload,
                formData.get('download_file') as File,
                new_metadata.asset
            )
        }

        /////////////////////////
        // Update Product Images
        /////////////////////////
        if (new_images.length != 0) {
            // Get Images
            const images_from_field = formData.getAll('product_images') as File[]

            // Upload Images
            for (let i = 0; i < new_images.length; i++) {
                await S3Upload(
                    artist?.handle!,
                    AWSLocations.Store,
                    images_from_field[i],
                    new_images[i]
                )
            }
        }

        /////////////////////////
        // Update Featured Image
        /////////////////////////
        if (new_featured_image) {
            const featured_image = formData.get('featured_image') as File

            // Delete Old Featured Image
            await S3Delete(
                artist?.handle!,
                AWSLocations.Store,
                old_featured_image
            )

            // Upload New Featured Image
            await S3Upload(
                artist?.handle!,
                AWSLocations.Store,
                featured_image,
                new_metadata.featured_image
            )
        }
    }


    // Update changed values on stripe
    await StripeUpdateProduct(
        db_product?.product!,
        updated_values,
        db_product?.stripeAccId!
    )

    return NextResponse.json<NemuResponse>({
        status: StatusCode.Success
    })
}
