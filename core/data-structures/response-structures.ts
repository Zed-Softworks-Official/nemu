import { InvoiceItem } from '@prisma/client'
import { ImageData } from './aws-structures'
import { AWSFileModification } from './form-structures'
import { KanbanContainerData } from './kanban-structures'
import { RouterOutput } from '../responses'

/**
 * Portfolio Item
 * Interface for API Calls on Portfolio Items
 *
 * @prop {string} signed_url - S3 Signed URL that contains the Portfolio Item
 * @prop {string} name - Name of the portfolio Item
 * @prop {string} key - Portfolio Image Name inside of the Database
 */
export interface PortfolioItem {
    data: ImageData
    name: string
}

export type ShopItemResponse = RouterOutput['artist_corner']['get_products']
export type ShopItemEditableResponse = RouterOutput['artist_corner']['get_product_editable']

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
    title: string
    description: string
    price: number

    featured_image: ImageData
    images?: ImageData[]
    edit_images?: AWSFileModification[]
    downloadable_asset?: string
    download_key?: string

    artist_id?: string
    stripe_account?: string
    id?: string
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

    containers?: KanbanContainerData[]
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

    featured_image?: ImageData
    availability?: CommissionAvailability

    images?: ImageData[]
    orders?: CommissionOrders[]
    form_id?: string
    handle?: string
    commission_id?: string
    published?: boolean

    slug?: string
}

/**
 *
 */
export interface InvoiceCommissionItem {
    id: string
    name: string
    quantity: number
    price: number
}

/**
 *
 */
export interface UpdateInvoiceData {
    items: InvoiceItem[]
    submission_id: string

    customer_id: string
    stripe_account: string
}

/**
 *
 */
export interface CommissionForm {
    user_submitted: boolean
    content: string
}

/**
 * Download Data
 * Holds information about a download
 *
 */
export interface DownloadData {
    download_url: string
    receipt_url?: string
    artist_handle: string

    created_at: Date
}
