import { Stripe } from 'stripe'
import { Artist, ArtistVerification, Form, FormSubmission, User } from '@prisma/client'
import { UniqueIdentifier } from '@dnd-kit/core'
import { FormElementInstance } from '@/components/form-builder/elements/form-elements'

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
    slug?: string
}

/**
 * CommissionAvailability
 * Handles a commissions availability
 * 
 * Closed, Waitlist, Open
 */
export enum CommissionAvailability {
    Closed,
    Waitlist,
    Open
}

/**
 * CommissionOrders
 * Handles the data for a comission order
 * 
 * @prop {string} user_id - The user id for the person who commissioned the artist
 * @prop {string} customer_id - The customer id fro the user
 * @prop {boolean} rush - Whether it's a rush order
 * @prop {KanbanData[]} - Containers for kanban
 * @prop {string} - The id for the commission order
 */
export interface CommissionOrders {
    user_id: string
    customer_id: string
    rush: boolean

    containers?: KanbanData[]
    order_id?: string
}

/**
 * CommissionItem
 * Handles data for commissions
 * 
 * @prop {string} name
 * @prop {string} description
 * @prop {number} price
 * 
 * @prop {string} featured_image
 * @prop {CommissionAvailability} availability
 * 
 * @prop {string[] | undefined} images
 * @prop {CommissionOrders[] | undefined} orders
 * 
 * @prop {string} prod_id
 * @prop {string} slug
 */
export interface CommissionItem {
    name: string
    description: string
    price: number
    
    featured_image: string
    availability: CommissionAvailability
    
    images?: string[]
    orders?: CommissionOrders[]
    form_id?: string
    
    prod_id?: string
    slug?: string
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

/**
 * Download Data
 * Holds information about a download
 *
 * @prop {string} name - The name of the download
 * @prop {string} artist - The artist handle the download is from
 * @prop {number} price - The price of the download from the product page
 * @prop {string} url - The url of where to download the item
 */
export interface DownloadData {
    name: string
    artist: string
    price: number
    url: string
}

/**
 * KanbanItem
 * 
 */
export interface KanbanItem {
    id: UniqueIdentifier
    title: string
}

/**
 * KanbanData
 * 
 */
export interface KanbanData {
    id: UniqueIdentifier
    title: string
    items: KanbanItem[]
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
 * ArtistPageRequest
 * Handles transfering the full artist object with the user
 *
 * @prop {Artist | null} info - The artist info from our database
 */
export interface ArtistPageResponse extends NemuResponse {
    artist: Artist | null
    user: User | null
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

/**
 * RandomArtistsResponse
 * Gets a random array of artists
 *
 * @prop {Artist[] | undefined} artists - Array of a certain number of random artists
 */
export interface RandomArtistsResponse extends NemuResponse {
    artists?: Artist[]
}

/**
 * CommissionResponse
 * 
 */
export interface CommissionResponse extends NemuResponse {
    commission?: CommissionItem
    commissions?: CommissionItem[]
}

/**
 * CommissionFormsResponse
 * 
 */
export interface CommissionFormsResponse extends NemuResponse {
    form?: Form & {formSubmissions: FormSubmission[]}
    forms?: Form[],
    formContent?: FormElementInstance[]
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

/////////////////////////////////////////////
// User API Responses
/////////////////////////////////////////////

/**
 * UserResponse
 * Handles information about the user
 *
 * @prop {User | null | undefined} info - The information on the user
 */
export interface UserResponse extends NemuResponse {
    info?: User | null
}

/**
 * DownloadsResponse
 * Handles distribution of Download data
 *
 * @prop {DownloadData[] | undefined} downloads - The data of the downloads
 */
export interface DownloadsResponse extends NemuResponse {
    downloads?: DownloadData[]
}