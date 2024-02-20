import { Stripe } from 'stripe'

import { NemuResponse } from './base-response'
import { ShopItem } from '../data-structures/response-structures'

/**
 * ShopResponse
 * Handles transfering products
 *
 * @prop {ShopItem | undefined} product - Can contain a SINGLE product
 * @prop {ShopItem[] | undefined} products - Can contain MULTIPLE products
 */
export interface ShopResponse extends NemuResponse {
    product?: ShopItem
    products?: ShopItem[]
    stripe_id?: string
}

/**
 * StripeAccountResponse
 * Handles information regarding the stripe account
 *
 * @prop {Stripe.Account} raw - The raw data from stripe
 * @prop {string} dashboard_url - The url for the stripe express dashbaord
 * @prop {string} onboarding_url - THe url for the stripe onboarding proccess
 */
export interface StripeAccountResponse extends NemuResponse {
    raw?: Stripe.Account
    dashboard_url?: string
    onboarding_url?: string
}

/**
 * 
 */
export interface StripeCustomerIdResponse extends NemuResponse {
    customer_id?: string
    stripe_account?: string
}
