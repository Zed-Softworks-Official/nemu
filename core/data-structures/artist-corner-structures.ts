export interface ConvertShopItemFromProductOptions {
    get_download_asset?: boolean
    editable?: boolean
    get_download_key?: boolean
    get_featured_image_key?: boolean
}

export interface StoreProductInputType {
    title?: string
    description?: string
    price?: number
    featured_image?: string
    additional_images?: string[]
    downloadable_asset?: string
}

export interface DownloadOptionsInputType extends ConvertShopItemFromProductOptions {}