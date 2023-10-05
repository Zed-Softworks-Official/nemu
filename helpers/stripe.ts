import Stripe from 'stripe';
import { ShopItem } from './api/request-inerfaces';
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
    
    let result: ShopItem = {
        image_urls: [],
        download_url: '',

        name: product.name,
        description: product.description!,
        price: 0,

        prod_id: proudct_id,
        stripe_id: stripe_account
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