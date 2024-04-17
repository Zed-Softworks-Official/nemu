import { env } from '~/env'
import { stripe } from '~/server/stripe'

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
            },
            transfers: {
                requested: true
            },
            tax_reporting_us_1099_k: {
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
        refresh_url: env.NEXTAUTH_URL + `/api/stripe/${stripe_account}/reauth`,
        return_url: env.NEXTAUTH_URL + '/dashboard',
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
