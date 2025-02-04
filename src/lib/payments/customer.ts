import { stripe } from '~/server/stripe'

/**
 * Creates a new customer in Stripe for the given stripe account
 *
 * @param {string} stripe_account - The stripe account to create the stripe customer
 * @param {string} name - The name of the new customer
 * @param {string} user_id - The user id of the customer
 * @param {string | undefined} email - The email of the customer if available
 * @returns A Stripe customer object
 */
export async function StripeCreateCustomer(
    stripe_account: string,
    name?: string,
    email?: string
) {
    return await stripe.customers.create(
        {
            name: name,
            email: email
        },
        { stripeAccount: stripe_account }
    )
}

/**
 * Creates a new customer in Stripe for Zed Softworks
 *
 * @param {string} name - The name of the new customer
 * @param {email} email - The email of the customer if available
 * @returns A Stripe customer object
 */
export async function StripeCreateCustomerZed(name: string, email?: string) {
    return await stripe.customers.create({
        name: name,
        email: email
    })
}

/**
 * Gets a Stripe customer given a stripe account
 *
 * @param {string} stripe_account - The stripe account to search within
 * @param {string} customer_id - The customer id of the user
 * @returns A Stripe customer object
 */
export async function StripeGetCustomer(stripe_account: string, customer_id: string) {
    return await stripe.customers.retrieve(customer_id, { stripeAccount: stripe_account })
}
