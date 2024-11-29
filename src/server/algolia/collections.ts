import 'server-only'

import { algoliasearch } from 'algoliasearch'
import type { ArtistIndex, CommissionIndex } from '~/core/structures'
import { env } from '~/env'

type SearchType = 'artists' | 'commissions'

const client = algoliasearch(env.ALGOLIA_APP_ID, env.ALGOLIA_API_KEY)

/**
 * @param {SearchType} index - The type of index to create
 * @param {ArtistIndex | CommissionIndex} data - The data to save
 */
export async function set_index(index: SearchType, data: ArtistIndex | CommissionIndex) {
    return await client.saveObject({
        indexName: index,
        body: data
    })
}

/**
 * @param {SearchType} index - The type of index to delete
 * @param {string} object_id - The object id to delete
 */
export async function del_index(index: SearchType, object_id: string) {
    return await client.deleteObject({
        indexName: index,
        objectID: object_id
    })
}

/**
 * @param {SearchType} index - The type of index to update
 * @param {ArtistIndex | CommissionIndex} data - The data to update
 */
export async function update_index(
    index: SearchType,
    data: ArtistIndex | CommissionIndex
) {
    return await client.partialUpdateObject({
        indexName: index,
        objectID: data.objectID,
        createIfNotExists: true,
        attributesToUpdate: data
    })
}
