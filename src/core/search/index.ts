import algoliasearch from 'algoliasearch/lite'

import { env } from '~/env'

export const algolia_client = algoliasearch(env.ALGOLIA_APP_ID, env.ALGOLIA_API_KEY)

export const search_artist = algolia_client.initIndex('artists')
export const search_commission = algolia_client.initIndex('commissions')
