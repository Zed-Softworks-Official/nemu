import Stripe from 'stripe'

import { stripe } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'

import { ShopItem, AWSLocations } from '../structures'
import { S3GetSignedURL } from '../storage'

import { StripeGetPriceInfo } from './prices'

/**
 * Creates a product on stripe
 *
 * @param {string} stripe_account - Stripe account to associate the product
 * @param {ShopItem} product - Product information
 * @returns The product data from stripe
 */
export async function StripeCreateStoreProduct(
    stripe_account: string,
    product: ShopItem
) {
    return await stripe.products.create(
        {
            name: product.name,
            description: product.description,
            images: product.images,
            metadata: {
                featured_image: product.featured_image,
                asset: product.asset!,
                slug: product.slug!
            },
            default_price_data: {
                currency: 'usd',
                unit_amount: product.price * 100
            }
        },
        {
            stripeAccount: stripe_account
        }
    )
}

/**
 * Updates a on stripe product with the given values
 *
 * @param {Stripe.ProductUpdateParams} product_update
 * @param {string} product_id
 * @param {string} stripe_account
 * @returns The updated stripe product
 */
export async function StripeUpdateProduct(
    product_id: string,
    product_update: Stripe.ProductUpdateParams,
    stripe_account: string
) {
    return await stripe.products.update(product_id, product_update, {
        stripeAccount: stripe_account
    })
}

export async function StripeDeleteProduct(product_id: string, stripe_account: string) {
    return await stripe.products.update(
        product_id,
        { active: false },
        { stripeAccount: stripe_account }
    )
}

/**
 * Finds a product given an id and a stripe account
 *
 * @param {string} product_id - The proudct id for the requested item
 * @param {string} stripe_account - The stripe account to find the item
 * @returns A ShopItem with all of the information on the product
 */
export async function StripeGetStoreProductInfo(
    product_id: string,
    stripe_account: string,
    purchased: boolean = false
) {
    const product = await stripe.products.retrieve(product_id, {
        stripeAccount: stripe_account
    })

    // Get the artist handle
    const artist = await prisma.artist.findFirst({
        where: {
            stripeAccId: stripe_account
        }
    })

    // Get general information on store product
    let result: ShopItem = {
        name: product.name,
        description: product.description!,
        price:
            (await StripeGetPriceInfo(product.default_price!.toString(), stripe_account))
                .unit_amount! / 100,

        featured_image: await S3GetSignedURL(
            artist!.handle,
            AWSLocations.Store,
            product.metadata.featured_image
        ),
        images: [],

        prod_id: product_id,
        slug: product.metadata.slug
    }

    if (purchased) {
        result.asset = await S3GetSignedURL(
            artist!.handle,
            AWSLocations.StoreDownload,
            product.metadata.asset
        )
    }

    // Loop through product images and convert them into signed urls for s3
    for (var i: number = 0; i < product.images.length; i++) {
        result.images!.push(
            await S3GetSignedURL(artist!.handle, AWSLocations.Store, product.images[i])
        )
    }

    return result
}

/**
 * Gets the raw stripe object instead of changing the data
 *
 * @param {string} product_id - The product to get the stripe
 * @param {string} stripe_account - The stripe account to find the item
 * @returns A Stripe product object
 */
export async function StripeGetRawProductInfo(
    product_id: string,
    stripe_account: string
) {
    return await stripe.products.retrieve(product_id, {
        stripeAccount: stripe_account
    })
}