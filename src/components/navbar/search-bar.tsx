'use client'

import algoliasearch from 'algoliasearch/lite'

import { InstantSearchNext } from 'react-instantsearch-nextjs'
import {
    Index,
    useSearchBox,
    useHits,
    UseHitsProps,
    UseSearchBoxProps
} from 'react-instantsearch'
import { SearchIcon, UserIcon } from 'lucide-react'
import { motion } from 'framer-motion'
import { useState } from 'react'

import { env } from '~/env'
import { Input } from '~/components/ui/input'
import { debounce } from '~/lib/utils'
import { Avatar, AvatarFallback } from '../ui/avatar'
import { AvatarImage } from '@radix-ui/react-avatar'
import { ArtistIndex } from '~/core/search'
import Link from 'next/link'
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList
} from '~/components/ui/command'

const search_client = algoliasearch(
    env.NEXT_PUBLIC_ALGOLIA_APP_ID,
    env.NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY
)

export default function SearchBar() {
    return (
        <div className="relative w-full">
            <InstantSearchNext
                searchClient={search_client}
                future={{ preserveSharedStateOnUnmount: true }}
            >
                <SearchBox />
            </InstantSearchNext>
        </div>
    )
}

function SearchBox(props: UseSearchBoxProps) {
    const { refine, query, clear } = useSearchBox(props)

    return (
        <Command className="ml-5 w-full rounded-xl bg-base-200 z-20">
            <CommandInput placeholder="Search" className="h-16" />
            <CommandList>
                <CommandEmpty>No Results Found!</CommandEmpty>
                <CommandGroup heading="Artists">
                    <Index indexName="artists">
                        <ArtistResult />
                    </Index>
                </CommandGroup>
            </CommandList>
        </Command>
    )
}

function ArtistResult(props: UseHitsProps<ArtistIndex>) {
    const { hits, sendEvent } = useHits(props)

    return (
        <>
            {hits.map((hit) => (
                <CommandItem
                    key={hit.objectID}
                    asChild
                >
                    <Link href={`/@${hit.handle}`} className='cursor-pointer'>
                        <div className="flex flex-row gap-5 p-2">
                            <Avatar>
                                <AvatarImage src={hit.image_url} alt="Avatar" />
                                <AvatarFallback>
                                    <UserIcon className="h-6 w-6" />
                                </AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col">
                                <h2 className="card-title">{hit.handle}</h2>
                                <p className="text-sm text-base-content/60">
                                    {hit.about}
                                </p>
                            </div>
                        </div>
                    </Link>
                </CommandItem>
            ))}
        </>
    )
}
