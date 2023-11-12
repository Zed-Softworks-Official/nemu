import Stripe from 'stripe'
import { prisma } from '@/lib/prisma'
import { ShopItem } from './api/request-inerfaces'
import { AWSLocations, S3GetSignedURL } from './s3'

const stripe = new Stripe(process.env.STRIPE_API_KEY!, {
    apiVersion: '2023-10-16'
})

/**
 * Raw Stripe Account Interface
 */
export interface StripeAccountResponse {
    raw?: Stripe.Account
    onboarding_url?: string
    dashboard_url?: string
}

/**
 *
 * @param stripe_account
 * @param item_info
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
                asset: product.asset!
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
 * Finds a product given an id and a stripe account
 *
 * @param {string} proudct_id - The proudct id for the requested item
 * @param {string} stripe_account - The stripe account to find the item
 * @returns {ShopItem} A ShopItem with all of the information on the product
 */
export async function StripeGetStoreProductInfo(
    proudct_id: string,
    stripe_account: string
) {
    let product = await stripe.products.retrieve(proudct_id, {
        stripeAccount: stripe_account
    })

    // Get the artist handle
    let artist = await prisma.artist.findFirst({
        where: {
            stripeAccId: stripe_account
        }
    })

    // Get general information on store product
    // TODO: Change so the download url only gets created when requested by a user that purchased the item
    let result: ShopItem = {
        name: product.name,
        description: product.description!,
        price: (await StripeGetPriceInfo(product.default_price!.toString(), stripe_account)).unit_amount! / 100,

        asset: await S3GetSignedURL(
            artist!.handle,
            AWSLocations.StoreDownload,
            product.metadata.download_link
        ),
        featured_image: await S3GetSignedURL(
            artist!.handle,
            AWSLocations.Store,
            product.metadata.featured_image
        ),

        prod_id: proudct_id,
    }

    // Loop through product images and convert them into signed urls for s3
    for (var i: number = 1; i < product.images.length + 1; i++) {
        result.images!.push(
            await S3GetSignedURL(
                artist!.handle,
                AWSLocations.Store,
                product.images[i - 1]
            )
        )
    }

    return result
}

/**
 * Finds the price info for a given price from a stripe account
 *
 * @param {string} price_id - The price id of the requested price
 * @param {string} stripe_account - The stripe account to find the price information
 * @returns A price object from stripe
 */
export async function StripeGetPriceInfo(price_id: string, stripe_account: string) {
    return await stripe.prices.retrieve(price_id, {
        stripeAccount: stripe_account
    })
}

/**
 * Create A Login Link for the artist to access their stripe dashboard
 *
 * @param {string} stripe_account - The stripe id for the artist
 * @returns A Stripe login link
 */
export async function StripeCreateLoginLink(stripe_account: string) {
    return await stripe.accounts.createLoginLink(stripe_account)
}

/**
 * Creates a new stripe account
 *
 * @returns {Stripe.Account} account information for the new account
 */
export async function StripeCreateAccount() {
    return await stripe.accounts.create({
        type: 'express'
    })
}

/**
 * Creates a stripe onboarding link for an artist
 *
 * @param {string} stripe_account - The stripe id for the artist
 * @returns stripe onboarding link
 */
export async function StripeCreateAccountLink(stripe_account: string) {
    return await stripe.accountLinks.create({
        account: stripe_account,
        refresh_url: process.env.BASE_URL + `/api/stripe/${stripe_account}/reauth`,
        return_url: process.env.BASE_URL + '/dashboard',
        type: 'account_onboarding'
    })
}

/**
 * Gets the stripe account for an artist given a stripe id
 *
 * @param {stripe} stripe_account - The Id of the account to get
 * @returns Stripe Account Information
 */
export async function StripeGetAccount(stripe_account: string) {
    return await stripe.accounts.retrieve({
        stripeAccount: stripe_account
    })
}
