'use client'

import Link from 'next/link'
import { useState, useEffect, useMemo } from 'react'
import { SearchIcon } from 'lucide-react'

import debounce from 'lodash.debounce'
import type { ArtistIndex, CommissionIndex } from '~/types/search'
import { client } from '~/server/algolia'

import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator
} from '~/components/ui/command'

import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import NemuImage from '~/components/nemu-image'

export default function SearchBar() {
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState('')

    const [artistHits, setArtistHits] = useState<ArtistIndex[]>([])
    const [commissionHits, setCommissionHits] = useState<CommissionIndex[]>([])

    useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                setOpen((open) => !open)
            }
        }

        document.addEventListener('keydown', down)
        return () => document.removeEventListener('keydown', down)
    }, [])

    const search = useMemo(
        () =>
            debounce(async (query: string) => {
                if (query.length > 0) {
                    const artists = client.searchForHits({
                        requests: [
                            {
                                indexName: 'artists',
                                query,
                                hitsPerPage: 5
                            }
                        ]
                    })

                    const commissions = client.search({
                        requests: [
                            {
                                indexName: 'commissions',
                                query,
                                hitsPerPage: 5
                            }
                        ]
                    })

                    const res = await Promise.all([artists, commissions])

                    setArtistHits(res[0].results as unknown as ArtistIndex[])
                    setCommissionHits(res[1].results as unknown as CommissionIndex[])
                } else {
                    setArtistHits([])
                    setCommissionHits([])
                }
            }, 500),
        []
    )

    useEffect(() => {
        const fetchResults = async () => {
            await search(query)
        }

        fetchResults().catch((e) =>
            console.error('Error in fetchResults:', e, 'Query:', query)
        )
    }, [query, search])

    return (
        <div className="relative h-full w-full">
            <div
                className="bg-background-secondary hidden h-16 w-full flex-row items-center justify-between rounded-xl p-5 sm:flex"
                onClick={() => setOpen(true)}
            >
                <div className="flex flex-row items-center gap-5">
                    <SearchIcon className="h-6 w-6" />
                    <span className="text-muted-foreground">Search</span>
                </div>
                <kbd className="bg-background-tertiary pointer-events-none inline-flex h-6 select-none items-center gap-1 rounded px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                    <span className="text-xs">⌘</span>K
                </kbd>
            </div>
            <CommandDialog open={open} onOpenChange={setOpen}>
                <CommandInput
                    placeholder="Search"
                    value={query}
                    onValueChange={(value) => setQuery(value)}
                />
                <CommandList>
                    <SearchResults
                        artistHits={artistHits}
                        commissionHits={commissionHits}
                    />
                </CommandList>
            </CommandDialog>
        </div>
    )
}

function SearchResults(props: {
    artistHits: ArtistIndex[]
    commissionHits: CommissionIndex[]
}) {
    if (props.artistHits.length === 0 && props.commissionHits.length === 0) {
        return <CommandEmpty>No Results Found</CommandEmpty>
    }

    return (
        <>
            <CommandGroup heading="Artists">
                {props.artistHits.map((artist) => (
                    <ArtistHit key={artist.objectID} hit={artist} />
                ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Commissions">
                {props.commissionHits.map((commission) => (
                    <CommissionHit key={commission.objectID} hit={commission} />
                ))}
            </CommandGroup>
        </>
    )
}

function ArtistHit(props: { hit: ArtistIndex | undefined }) {
    if (!props.hit) return null

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
                    <span className="text-base-content text-sm">{props.hit.title}</span>
                    <span className="text-base-content/40 text-sm">
                        @{props.hit.artist_handle}
                    </span>
                    <span className="text-base-content/80 text-sm">
                        {props.hit.description}
                    </span>
                    <span className="text-base-content/60 text-sm">
                        {props.hit.price}
                    </span>
                </div>
            </Link>
        </CommandItem>
    )
}
