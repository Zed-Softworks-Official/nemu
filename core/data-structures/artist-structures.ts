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
    published?: boolean
}

export interface DownloadOptionsInputType extends ConvertShopItemFromProductOptions {}

export enum VerificationMethod {
    Code,
    Twitter,
    Email
}

export interface ArtistVerificationInputType {
    method?: VerificationMethod
    requested_handle?: string
    username?: string
    twitter?: string
    pixiv?: string
    website?: string
    location?: string
    user_id?: string
    artist_code?: string
}