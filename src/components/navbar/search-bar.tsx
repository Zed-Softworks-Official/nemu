'use client'

import Link from 'next/link'
import { type Dispatch, type SetStateAction, useEffect, useState } from 'react'

import debounce from 'lodash.debounce'
import algoliasearch from 'algoliasearch/lite'

import { InstantSearchNext } from 'react-instantsearch-nextjs'
import { Index, Hits, Configure, useSearchBox } from 'react-instantsearch'

import { SearchIcon } from 'lucide-react'

import { env } from '~/env'
import type { ArtistIndex, CommissionIndex } from '~/core/search'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import NemuImage from '~/components/nemu-image'
import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator
} from '~/components/ui/command'

const search_client = algoliasearch(
    env.NEXT_PUBLIC_ALGOLIA_APP_ID,
    env.NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY
)

const query_hook = debounce((query: string, search: (value: string) => void) => {
    search(query)
    console.log(query)
}, 300)

export default function SearchBar() {
    const [open, setOpen] = useState(false)

    return (
        <div className="relative h-full w-full">
            <InstantSearchNext
                searchClient={search_client}
                indexName="artists"
                future={{ preserveSharedStateOnUnmount: true }}
            >
                <div
                    className="flex h-16 w-full flex-row items-center justify-between rounded-xl bg-base-200 p-5"
                    onClick={() => setOpen(true)}
                >
                    <Configure hitsPerPage={5} />
                    <div className="flex flex-row items-center gap-5">
                        <SearchIcon className="h-6 w-6" />
                        <span className="text-base-content/80">Search</span>
                    </div>
                    <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded bg-base-300 px-1.5 font-mono text-[10px] font-medium text-base-content/80 opacity-100">
                        <span className="text-xs">⌘</span>K
                    </kbd>
                </div>
                <SearchPallete open={open} setOpen={setOpen} />
            </InstantSearchNext>
        </div>
    )
}

function SearchPallete(props: {
    open: boolean
    setOpen: Dispatch<SetStateAction<boolean>>
}) {
    const { refine } = useSearchBox({
        queryHook: query_hook
    })

    useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                props.setOpen((open) => !open)
            }
        }

        document.addEventListener('keydown', down)
        return () => document.removeEventListener('keydown', down)
    }, [props])

    return (
        <CommandDialog
            open={props.open}
            onOpenChange={props.setOpen}
            shouldFilter={false}
        >
            <CommandInput placeholder="Search" onValueChange={(value) => refine(value)} />
            <CommandList>
                <CommandEmpty>No Results Found</CommandEmpty>
                <CommandGroup heading="Artists">
                    <Index indexName="artists">
                        <Hits hitComponent={ArtistHit} />
                    </Index>
                </CommandGroup>
                <CommandSeparator />
                <CommandGroup heading="Commissions">
                    <Index indexName="commissions">
                        <Hits hitComponent={CommissionHit} />
                    </Index>
                </CommandGroup>
            </CommandList>
        </CommandDialog>
    )
}

function ArtistHit(props: { hit: ArtistIndex }) {
    return (
        <CommandItem className="rounded-xl">
            <Link
                href={`/@${props.hit.handle}`}
                className="flex flex-row items-center gap-3"
            >
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
                <span>@{props.hit.handle}</span>
            </Link>
        </CommandItem>
    )
}

function CommissionHit(props: { hit: CommissionIndex }) {
    if (!props.hit.published) return null

    return (
        <CommandItem className="rounded-xl">
            <Link
                href={`/@${props.hit.artist_handle}/commission/${props.hit.slug}`}
                className="flex flex-row items-center gap-3"
            >
                <NemuImage
                    src={props.hit.featured_image}
                    alt="Featured Image"
                    width={80}
                    height={80}
                    className="rounded-xl"
                />
                <div className="flex flex-col gap-3">
                    <span className="text-sm text-base-content">{props.hit.title}</span>
                    <span className="text-sm text-base-content/40">
                        @{props.hit.artist_handle}
                    </span>
                    <span className="text-sm text-base-content/80">
                        {props.hit.description}
                    </span>
                    <span className="text-sm text-base-content/60">
                        {props.hit.price}
                    </span>
                </div>
            </Link>
        </CommandItem>
    )
}
