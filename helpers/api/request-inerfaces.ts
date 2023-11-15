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
    name: string,
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
    name: string,
    description: string
    price: number

    featured_image: string
    images?: string[]
    asset?: string

    prod_id?: string
}

/**
 * 
 */
export interface PurchasePageRequest {
    product_id: string
    stripe_account: string
}