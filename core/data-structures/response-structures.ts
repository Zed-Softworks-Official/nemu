import { KanbanData } from './kanban-structures'

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
    image_key: string
    name: string
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
    title: string
    description: string
    price: number
    due_date?: Date

    featured_image?: string
    availability?: CommissionAvailability

    images?: string[]
    orders?: CommissionOrders[]
    form_id?: string
    handle?: string
    commission_id?: string
    published?: boolean
    use_invoicing?: boolean

    prod_id?: string
    slug?: string
}

export interface CommissionForm {
    user_submitted: boolean
    content: string
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
