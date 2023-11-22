import { Stripe } from 'stripe'
import { Artist, ArtistVerification, User } from '@prisma/client'

/////////////////////////////////////////////
// Data Structures
/////////////////////////////////////////////

/**
 * Portfolio Item
 * Interface for API Calls on Portfolio Items
 *
 * @prop {string} signed_url - S3 Signed URL that contains the Portfolio Item
 * @prop {string} name - Name of the portfolio Item
 * @prop {string} key - Portfolio Image Name inside of the Database
 */
export interface PortfolioItem {
    signed_url: string
    name: string
    key: string
}

/**
 * Shop Item
 * Interface for API Calls on Shop Items
 *
 * @prop {string} name - The name of the shop item
 * @prop {string} description - The description of the shop item
 * @prop {number} price - The price of the shop item
 *
 * @prop {string} featured_image - Contains featured image for product
 * @prop {string[] | undefined} images - Contains (at most) 8 Images
 * @prop {string | undefined} asset - Contains S3 Signed Download URL for the item
 *
 * @prop {string} prod_id - Product ID of product on stripe
 */
export interface ShopItem {
    name: string
    description: string
    price: number

    featured_image: string
    images?: string[]
    asset?: string

    prod_id?: string
}

/**
 * PurchasePageData
 * Handles the main information for the purchase page
 *
 * @prop {string} product_id - The product id
 * @prop {string} stripe_account - The stripe account for product
 */
export interface PurchasePageData {
    product_id: string
    stripe_account: string
    user_id: string
}


/////////////////////////////////////////////
// API
/////////////////////////////////////////////

/**
 * StatusCode
 * Generic http status codes used inside of nemu
 */
export enum StatusCode {
    Success = 200,
    MovedPermanently = 301,
    Redirect = 302,
    BadRequest = 400,
    Unauthorized = 401,
    PaymentRequired = 402,
    InternalError = 500,
    NotImplemented = 501
}


/////////////////////////////////////////////
// API Requests
/////////////////////////////////////////////

export interface ProductRequest {
    product_id?: string
    user_id?: string
    purchased?: boolean
}

/////////////////////////////////////////////
// API Responses
/////////////////////////////////////////////

/**
 * Nemu Response
 * The generic response from an api route
 *
 * @prop {StatusCode} status - The status code
 * @prop {string} message - Message containing information about what occured
 */
export interface NemuResponse {
    status: StatusCode
    message?: string
}

/////////////////////////////////////////////
// Artist API Responses
/////////////////////////////////////////////

/**
 * ArtistRequest
 * Handles transfering the full artist object
 *
 * @prop {Artist | null} info - The artist info from our database
 */
export interface ArtistResponse extends NemuResponse {
    info: Artist | null
}

/**
 * ArtistVerificationResponse
 * Handles transfering all artists inside of the verification table
 *
 * @prop {ArtistVerification[] | null} artists - The artists within the verification table
 */
export interface ArtistVerificationResponse extends NemuResponse {
    artists?: ArtistVerification[] | null
}

/**
 * ArtistCodeResponse
 * Handles transfering an artist code
 *
 * @prop {string} generated_code - The generated artist code to hand to an artist
 */
export interface ArtistCodeResponse extends NemuResponse {
    generated_code: string
}

/**
 * PortfolioResponse
 * Handles transferring portfolio items
 *
 * @prop {PortfolioItem | null} item - Can contain a SINGLE portfolio item
 * @prop {PortfolioItem[] | null} items - Can contain MULTIPLE portfolio items
 */
export interface PortfolioResponse extends NemuResponse {
    item?: PortfolioItem | null
    items?: PortfolioItem[] | null
}

export interface RandomArtistsResponse extends NemuResponse {
    artists?: Artist[]
}

/////////////////////////////////////////////
// Stripe API Responses
/////////////////////////////////////////////

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

/////////////////////////////////////////////
// User API Responses
/////////////////////////////////////////////

export interface UserResponse extends NemuResponse {
    info?: User | null
}