import algoliasearch from 'algoliasearch/lite'

import { env } from '~/env'

const client = algoliasearch(
    env.NEXT_PUBLIC_ALGOLIA_APP_ID,
    env.NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY
)

const artist_index = client.initIndex('artists')
const commission_index = client.initIndex('commissions')

export { artist_index, commission_index }
