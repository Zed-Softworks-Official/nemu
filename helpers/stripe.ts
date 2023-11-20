import Stripe from 'stripe'
import { prisma } from '@/lib/prisma'
import { ShopItem } from './api/request-inerfaces'
import { AWSLocations, S3GetSignedURL } from './s3'

const stripe = new Stripe(process.env.STRIPE_API_KEY!, {
    apiVersion: '2023-10-16'
})

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
 * @param {string} product_id - The proudct id for the requested item
 * @param {string} stripe_account - The stripe account to find the item
 * @returns A ShopItem with all of the information on the product
 */
export async function StripeGetStoreProductInfo(
    product_id: string,
    stripe_account: string,
    purchased: boolean = false
) {
    let product = await stripe.products.retrieve(product_id, {
        stripeAccount: stripe_account
    })

    // Get the artist handle
    let artist = await prisma.artist.findFirst({
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

        prod_id: product_id
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
            await S3GetSignedURL(
                artist!.handle,
                AWSLocations.Store,
                product.images[i]
            )
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

/**
 * Creates a stripe checkout session for a given product
 *
 * @param {Stripe.Product} product - The product to get the stripe
 * @param {string} stripe_account
 * @returns A stripe checkout session
 */
export async function StripeGetPurchasePage(
    product: Stripe.Product,
    stripe_account: string
) {
    const artist = await prisma.artist.findFirst({
        where: {
            stripeAccId: stripe_account
        }
    })

    return await stripe.checkout.sessions.create(
        {
            line_items: [
                {
                    price: product.default_price!.toString(),
                    quantity: 1
                }
            ],
            mode: 'payment',
            success_url: `${process.env.BASE_URL}/payments/success`,
            cancel_url: `${process.env.BASE_URL}/@${artist?.handle}`
        },
        {
            stripeAccount: stripe_account
        }
    )
}

export async function StripeCreatePrice(amount: number, product_id: string, stripe_account: string) {
    return await stripe.prices.create(
        {
            currency: 'usd',
            unit_amount: amount * 100,
            product: product_id
        },
        {
            stripeAccount: stripe_account
        }
    )
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
 * Collects all prices for a given stripe account
 *
 * @param {string} stripe_account - The stripe id to gather all of the prices
 * @returns A list of all prices for a given account
 */
export async function StripeGetPrices(stripe_account: string) {
    return await stripe.prices.list(
        {},
        {
            stripeAccount: stripe_account
        }
    )
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
        type: 'express',
        capabilities: {
            card_payments: {
                requested: true
            }
        }
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
