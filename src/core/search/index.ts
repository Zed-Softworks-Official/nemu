import algoliasearch from 'algoliasearch'
import { ArtistIndex, CommissionIndex } from '~/core/search/types'

import { env } from '~/env'

/**
 * Creates a new algolia client
 *
 * Used for adding/modifying indecies
 */
export const algolia_client = algoliasearch(env.ALGOLIA_APP_ID, env.ALGOLIA_API_KEY)

/**
 * Exports the search types
 */
export * from '~/core/search/types'

type SearchType = 'artists' | 'commissions'

/**
 * @param {SearchType} index - The type of index to create
 * @param {ArtistIndex | CommissionIndex} data - The data to save
 */
export async function set_index(index: SearchType, data: ArtistIndex | CommissionIndex) {
    const search_index = algolia_client.initIndex(index)

    return await search_index.saveObject(data)
}

/**
 * @param {SearchType} index - The type of index to delete
 * @param {string} object_id - The object id to delete
 */
export async function del_index(index: SearchType, object_id: string) {
    const search_index = algolia_client.initIndex(index)

    return await search_index.deleteObject(object_id)
}

/**
 * @param {SearchType} index - The type of index to update
 * @param {ArtistIndex | CommissionIndex} data - The data to update
 */
export async function update_index(index: SearchType, data: ArtistIndex | CommissionIndex) {
    const search_index = algolia_client.initIndex(index)

    return await search_index.partialUpdateObject(data, {
        createIfNotExists: true
    })
}
