'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import algoliasearch from 'algoliasearch/lite'

import { InstantSearchNext } from 'react-instantsearch-nextjs'
import { Index, SearchBox, Hits } from 'react-instantsearch'

import { SearchIcon } from 'lucide-react'

import { env } from '~/env'
import { ArtistIndex } from '~/core/search'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import NemuImage from '~/components/nemu-image'

const search_client = algoliasearch(
    env.NEXT_PUBLIC_ALGOLIA_APP_ID,
    env.NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY
)

export default function SearchBar() {
    // const [activeSearch, setActiveSearch] = useState('')
    const [searchFocused, setSearchFocused] = useState(false)

    return (
        <div className="relative h-full w-full">
            <InstantSearchNext
                searchClient={search_client}
                indexName="artists"
                future={{ preserveSharedStateOnUnmount: true }}
            >
                <div className="relative ml-auto h-full w-full flex-1">
                    <SearchBox
                        queryHook={(query, search) => {
                            // setActiveSearch(query)
                            search(query)
                        }}
                        onFocus={() => setSearchFocused(true)}
                        onBlur={() => setSearchFocused(false)}
                        placeholder="Search"
                        classNames={{
                            input: 'w-full h-16 rounded-xl bg-base-200 p-5 pl-10 '
                        }}
                        submitIconComponent={() => (
                            <SearchIcon className="absolute left-3 top-[1.30rem] h-5 w-5 text-base-content/80" />
                        )}
                        resetIconComponent={() => null}
                    />
                </div>

                {searchFocused && (
                    <div className="absolute top-20 z-10 w-full rounded-xl bg-base-300 p-5 shadow-xl">
                        <div className="relative flex h-full flex-col">
                            <div className="divider card-title">Artists</div>
                            <Index indexName="artists">
                                <Hits hitComponent={ArtistHit} />
                            </Index>
                        </div>
                    </div>
                )}
            </InstantSearchNext>
        </div>
    )
}

function ArtistHit(props: { hit: ArtistIndex }) {
    return (
        <Link
            href={`/@${props.hit.handle}`}
            className="flex flex-row items-center justify-between gap-3 rounded-xl p-5 hover:bg-base-100"
        >
            <div className="flex flex-row items-center gap-5">
                <Avatar>
                    <AvatarImage src={props.hit.image_url} alt="Avatar" />
                    <AvatarFallback>
                        <NemuImage
                            src={'/profile.png'}
                            alt="Profile"
                            width={20}
                            height={20}
                        />
                    </AvatarFallback>
                </Avatar>
                <h1>{props.hit.handle}</h1>
            </div>
        </Link>
    )
}
