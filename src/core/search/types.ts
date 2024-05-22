/**
 * Default search type for algolia indecies
 */
type SearchIndex = {
    objectID: string
}

/**
 * Artist Search Index
 * 
 * Contains all of the information relavent for an artist search
 */
export type ArtistIndex = {
    handle: string,
    about: string
    image_url: string
} & SearchIndex

/**
 * Commission Search Index
 * 
 * Contains all of the information relavent for a commission search
 */
export type CommissionIndex = {
    title: string,
    price: string,
    description: string
    featured_image: string
    slug: string
} & SearchIndex