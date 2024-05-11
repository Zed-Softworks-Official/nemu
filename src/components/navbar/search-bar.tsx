'use client'

import algoliasearch from 'algoliasearch/dist/algoliasearch-lite'

import { InstantSearchNext } from 'react-instantsearch-nextjs'
import { SearchBox, Index, Hits } from 'react-instantsearch'
import { SearchIcon } from 'lucide-react'
import { motion } from 'framer-motion'

import { env } from '~/env'

const search_client = algoliasearch(
    env.NEXT_PUBLIC_ALGOLIA_APP_ID,
    env.NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY
)

export default function SearchBar() {
    return (
        <InstantSearchNext
            searchClient={search_client}
            future={{ preserveSharedStateOnUnmount: true }}
        >
            <SearchBox submitIconComponent={() => <SearchIcon className="h-6 w-6" />} />
        </InstantSearchNext>
    )
}

function SearchResult() {
    return <div className="absolute top-0 flex h-full w-full flex-col gap-5 p-5"></div>
}
