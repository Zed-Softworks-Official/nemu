import Stripe from 'stripe';
import { ShopItem } from './api/request-inerfaces';
import { AWSLocations, S3GetSignedURL } from './s3';
import { prisma } from '@/lib/prisma';
const stripe = new Stripe(process.env.STRIPE_API_KEY!, {
    apiVersion: '2023-08-16'
});

/**
 * Finds a product given an id and a stripe account
 * 
 * @param {string} proudct_id - The proudct id for the requested item
 * @param {string} stripe_account - The stripe account to find the item
 * @returns {ShopItem} A ShopItem with all of the information on the product
 */
export async function StripeGetStoreProductInfo(proudct_id: string, stripe_account: string) {
    let product = await stripe.products.retrieve(proudct_id, { stripeAccount: stripe_account });
    
    // Get the artist handle
    let artist = await prisma.artist.findFirst({
        where: {
            stripeAccId: stripe_account
        }
    });

    // Get general information on store product
    // TODO: Change so the download url only gets created when requested by a user that purchased the item
    let result: ShopItem = {
        download_url: await S3GetSignedURL(artist!.handle, AWSLocations.StoreDownload, product.metadata.download_link),

        name: product.name,
        description: product.description!,
        price: product.default_price!.toString(),

        prod_id: proudct_id,
        stripe_id: stripe_account
    }

    // Set the featured photo to be the first photo
    result.image_urls = [await S3GetSignedURL(artist!.handle, AWSLocations.Store, product.metadata.featured_photo)];
    
    // Loop through product images and convert them into signed urls for s3
    for (var i: number = 1; i < product.images.length + 1; i++) {
        result.image_urls.push(await S3GetSignedURL(artist!.handle, AWSLocations.Store, product.images[i - 1]));
    }

    return result;
}


/**
 * Finds the price info for a given price from a stripe account 
 * 
 * @param {string} price_id - The price id of the requested price
 * @param {string} stripe_account - The stripe account to find the price information
 * @returns A price object from stripe
 */
export async function StipeGetPriceInfo(price_id: string, stripe_account: string) {
    return await stripe.prices.retrieve(price_id, { stripeAccount: stripe_account });
}


/**
 * Create A Login Link for the artist to access their stripe dashboard
 * 
 * @param {string} stripe_account - The stripe id for the artist
 * @returns A Stripe login link
 */
export async function StripeCreateLoginLink(stripe_account: string) {
    return await stripe.accounts.createLoginLink(stripe_account);
}


/**
 * Creates a new stripe account
 * 
 * @returns {Stripe.Account} account information for the new account
 */
export async function StripeCreateAccount() {
    return await stripe.accounts.create({
        type: 'express'
    });
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
        refresh_url: process.env.BASE_URL + '/stripe/reauth',
        return_url: process.env.BASE_URL + '/dashboard',
        type: 'account_onboarding'
    });
}