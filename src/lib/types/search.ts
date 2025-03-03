/**
 * Default search type for algolia indecies
 */
type BaseSearchIndex = {
    objectID: string
}

/**
 * Artist Search Index
 *
 * Contains all of the information relavent for an artist search
 */
export type ArtistIndex = {
    handle: string
    about: string
    imageUrl: string
} & BaseSearchIndex

export type ArtistEditIndex = {
    handle?: string
    about?: string
    imageUrl?: string
} & BaseSearchIndex

/**
 * Commission Search Index
 *
 * Contains all of the information relavent for a commission search
 */
export type CommissionIndex = {
    artistHandle: string
    title: string
    price: string
    featuredImage: string
    slug: string
    published: boolean
} & BaseSearchIndex

export type CommissionEditIndex = {
    artistHandle?: string
    title?: string
    price?: string
    featuredImage?: string
    slug?: string
    published?: boolean
} & BaseSearchIndex

/**
 * Product Search Index
 *
 * Contains all of the information relavent for a product search
 */
export type ProductIndex = {
    artistHandle: string
    name: string
    price: string
    id: string
    imageUrl: string
    published: boolean
} & BaseSearchIndex

export type ProductEditIndex = {
    artistHandle?: string
    name?: string
    price?: string
    id?: string
    imageUrl?: string
    published?: boolean
} & BaseSearchIndex
