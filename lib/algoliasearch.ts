import algoliasearch, { SearchClient, SearchIndex } from 'algoliasearch'

type NemuAlgoliaClient = {
    client: SearchClient
    artistIndex: SearchIndex
    commissionIndex: SearchIndex
    productIndex: SearchIndex
}

function CreateAlgoliaObject(): NemuAlgoliaClient {
    const client = algoliasearch(process.env.ALGOLIA_APP_ID, process.env.ALGOLIA_API_KEY)

    const artistIndex = client.initIndex('artists')
    const commissionIndex = client.initIndex('commissions')
    const productIndex = client.initIndex('products')

    return {
        client: client,
        artistIndex: artistIndex,
        commissionIndex: commissionIndex,
        productIndex: productIndex
    }
}

const globalForAlgolia = global as unknown as { algolia: NemuAlgoliaClient }

export const algolia = globalForAlgolia.algolia || CreateAlgoliaObject()

if (process.env.NODE_ENV !== 'production') globalForAlgolia.algolia = algolia