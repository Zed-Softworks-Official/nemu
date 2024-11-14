import { liteClient } from 'algoliasearch/lite'

import { env } from '~/env'

const client = liteClient(
    env.NEXT_PUBLIC_ALGOLIA_APP_ID,
    env.NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY
)

export { client }
