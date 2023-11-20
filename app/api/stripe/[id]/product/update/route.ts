import Stripe from 'stripe'

import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

import {
    StripeCreatePrice,
    StripeGetPriceInfo,
    StripeGetPrices,
    StripeGetRawProductInfo,
    StripeUpdateProduct
} from '@/helpers/stripe'
import { NemuResponse, StatusCode } from '@/helpers/api/request-inerfaces'
import { AWSLocations, S3Upload } from '@/helpers/s3'

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
    let updated_values: Stripe.ProductUpdateParams = {}
    let create_new_price: boolean = false
    let new_price_value: number | undefined

    let file_count = product.images.length
    let new_images: string[] = []

    // Check to see which values have been updated
    formData.forEach((value, key) => {
        switch (key) {
            case 'product_name':
                updated_values.name =
                    value != product.name ? (value as string) : undefined
                break
            case 'product_description':
                updated_values.description =
                    value != product.description ? (value as string) : undefined
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
                const file = value as File
                if (file.size != 0 && file_count < 8) {
                    new_images.push(crypto.randomUUID())
                    file_count++
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

    // Upload New Images if they exist
    if (new_images.length != 0) {
        // Get Artist
        const artist = await prisma.artist.findFirst({
            where: {
                userId: db_product?.userId
            }
        })

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

        // Add new images to product
        updated_values.images = product.images.concat(new_images)
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
