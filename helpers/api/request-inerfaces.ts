/**
* Portfolio Item
* Interface for API Calls on Portfolio Items
* 
* @property {string} signed_url - S3 Signed URL that contains the Portfolio Item
* @property {string} name - Name of the portfolio Item
* @property {string} key - Portfolio Image Name inside of the Database
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
* @property {string[]} image_urls - Contains (at most) 8 Image S3 Signed URLs
* @property {string | null} download_url - Contains S3 Signed Download URL for the item
* 
* @property {string} name - The name of the shop item
* @property {string} description - The description of the shop item
* @property {string} price - The price of the shop item
*
* @property {string} stripe_id - Stripe ID of the user selling the product
* @property {string} prod_id - Product ID of product on stripe
*/
export interface ShopItem {
    image_urls?: string[]
    download_url?: string
    
    name: string,
    description: string
    price: string

    stripe_id: string
    prod_id: string
}