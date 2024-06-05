'use client'

import Link from 'next/link'
import { useState } from 'react'
import algoliasearch from 'algoliasearch/lite'

import { InstantSearchNext } from 'react-instantsearch-nextjs'
import { Index, SearchBox, Hits } from 'react-instantsearch'

import { SearchIcon } from 'lucide-react'

import { env } from '~/env'
import { ArtistIndex, CommissionIndex } from '~/core/search'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import NemuImage from '~/components/nemu-image'
import debounce from 'lodash.debounce'

const search_client = algoliasearch(
    env.NEXT_PUBLIC_ALGOLIA_APP_ID,
    env.NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY
)

export default function SearchBar() {
    const [searchFocused, setSearchFocused] = useState(false)

    const debounceInput = debounce((query: string, search: (value: string) => void) => {
        search(query)
    }, 300)

    return (
        <div className="relative h-full w-full">
            <InstantSearchNext
                searchClient={search_client}
                indexName="artists"
                future={{ preserveSharedStateOnUnmount: true }}
            >
                <div className="relative ml-auto h-full w-full flex-1">
                    <SearchBox
                        queryHook={debounceInput}
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

                            <div className="divider card-title">Commissions</div>
                            <Index indexName="commissions">
                                <Hits hitComponent={CommissionHit} />
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
            className="flex flex-row items-center justify-between gap-3 rounded-xl p-5 transition-all duration-200 ease-in-out hover:bg-base-100"
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

function CommissionHit(props: { hit: CommissionIndex }) {
    return (
        <Link
            href={`/@${props.hit.artist_handle}/commission/${props.hit.slug}`}
            className="card transition-all duration-200 ease-in-out lg:card-side hover:bg-base-100"
        >
            <figure>
                <NemuImage
                    src={props.hit.featured_image}
                    alt="Featured Image"
                    width={80}
                    height={80}
                />
            </figure>
            <div className="card-body">
                <h2 className="text-lg font-bold">{props.hit.title}</h2>
                <p>{props.hit.description}</p>
                <div className="card-actions">{props.hit.price}</div>
            </div>
        </Link>
    )
}
