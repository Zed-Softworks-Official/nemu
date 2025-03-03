import 'server-only'

import { algoliasearch } from 'algoliasearch'
import type {
    ArtistEditIndex,
    ArtistIndex,
    CommissionEditIndex,
    CommissionIndex
} from '~/lib/types'
import { env } from '~/env'

type SearchType = 'artists' | 'commissions'

const client = algoliasearch(env.ALGOLIA_APP_ID, env.ALGOLIA_API_KEY)

/**
 * @param {SearchType} index - The type of index to create
 * @param {ArtistIndex | CommissionIndex} data - The data to save
 */
export async function setIndex(index: SearchType, data: ArtistIndex | CommissionIndex) {
    return await client.saveObject({
        indexName: index,
        body: data
    })
}

/**
 * @param {SearchType} index - The type of index to delete
 * @param {string} objectId - The object id to delete
 */
export async function delIndex(index: SearchType, objectId: string) {
    return await client.deleteObject({
        indexName: index,
        objectID: objectId
    })
}

/**
 * @param {SearchType} index - The type of index to update
 * @param {ArtistIndex | CommissionIndex} data - The data to update
 */
export async function updateIndex(
    index: SearchType,
    data: ArtistEditIndex | CommissionEditIndex
) {
    return await client.partialUpdateObject({
        indexName: index,
        objectID: data.objectID,
        createIfNotExists: true,
        attributesToUpdate: data
    })
}
