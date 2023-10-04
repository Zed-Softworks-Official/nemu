import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_API_KEY!, {
    apiVersion: '2023-08-16'
});


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