'use client'

import Link from 'next/link'
import { useState, useEffect, useMemo } from 'react'
import { SearchIcon } from 'lucide-react'

import debounce from 'lodash.debounce'
import type { ArtistIndex, CommissionIndex, ProductIndex } from '~/lib/types'
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
import { Button } from './ui/button'
import { DialogTitle } from './ui/dialog'

export default function SearchBar() {
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState('')

    const [artistHits, setArtistHits] = useState<ArtistIndex[]>([])
    const [commissionHits, setCommissionHits] = useState<CommissionIndex[]>([])
    const [productHits, setProductHits] = useState<ProductIndex[]>([])

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
                    const hits = await client.searchForHits({
                        requests: [
                            {
                                indexName: 'artists',
                                query,
                                hitsPerPage: 5
                            },
                            {
                                indexName: 'commissions',
                                query,
                                hitsPerPage: 5
                            },
                            {
                                indexName: 'products',
                                query,
                                hitsPerPage: 5
                            }
                        ]
                    })

                    const artistHits = hits.results[0]?.hits as unknown as ArtistIndex[]
                    const commissionHits = hits.results[1]
                        ?.hits as unknown as CommissionIndex[]
                    const productHits = hits.results[2]?.hits as unknown as ProductIndex[]

                    setArtistHits(artistHits)
                    setCommissionHits(commissionHits)
                    setProductHits(productHits)
                } else {
                    setArtistHits([])
                    setCommissionHits([])
                    setProductHits([])
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
        <div className="relative">
            <div
                className="bg-background-secondary hidden items-center justify-between gap-2 rounded-md p-3 sm:flex"
                onClick={() => setOpen(true)}
            >
                <SearchIcon className="size-4" />
                <kbd className="bg-background-tertiary text-muted-foreground pointer-events-none inline-flex h-6 items-center gap-1 rounded px-1.5 font-mono text-[10px] font-medium opacity-100 select-none">
                    <span className="text-xs">⌘</span>K
                </kbd>
            </div>
            <div className="flex w-full items-center justify-center sm:hidden">
                <Button
                    size={'lg'}
                    className="bg-background-secondary hover:bg-background-tertiary"
                    onClick={() => setOpen(true)}
                >
                    <SearchIcon className="h-5! w-5!" />
                </Button>
            </div>
            <CommandDialog open={open} onOpenChange={setOpen}>
                <DialogTitle className="sr-only">Search</DialogTitle>
                <CommandInput
                    placeholder="Search"
                    value={query}
                    onValueChange={(value) => setQuery(value)}
                />
                <CommandList>
                    <SearchResults
                        artistHits={artistHits}
                        commissionHits={commissionHits}
                        productHits={productHits}
                    />
                </CommandList>
            </CommandDialog>
        </div>
    )
}

function SearchResults(props: {
    artistHits: ArtistIndex[]
    commissionHits: CommissionIndex[]
    productHits: ProductIndex[]
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
            <CommandSeparator />
            <CommandGroup heading="Products">
                {props.productHits.map((product) => (
                    <ProductHit key={product.objectID} hit={product} />
                ))}
            </CommandGroup>
        </>
    )
}

function ProductHit(props: { hit: ProductIndex }) {
    if (!props.hit.published) return null

    return (
        <CommandItem className="rounded-xl">
            <Link
                href={`/@${props.hit.artistHandle}/artist-corner/${props.hit.objectID}`}
                className="flex flex-row items-center gap-3"
            >
                <NemuImage
                    src={props.hit.imageUrl}
                    alt={props.hit.title}
                    width={80}
                    height={80}
                    className="rounded-xl"
                />
                <div className="flex flex-col gap-3">
                    <span className="text-foreground text-sm">{props.hit.title}</span>
                    <span className="text-muted-foreground text-sm">
                        @{props.hit.artistHandle}
                    </span>
                    <span className="text-muted-foreground text-sm">
                        {props.hit.price}
                    </span>
                </div>
            </Link>
        </CommandItem>
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
                    <AvatarImage src={props.hit.imageUrl} alt="Avatar" />
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
                href={`/@${props.hit.artistHandle}/commission/${props.hit.slug}`}
                className="flex flex-row items-center gap-3"
            >
                <NemuImage
                    src={props.hit.featuredImage}
                    alt="Featured Image"
                    width={80}
                    height={80}
                    className="rounded-xl"
                />
                <div className="flex flex-col gap-3">
                    <span className="text-foreground text-sm">{props.hit.title}</span>
                    <span className="text-muted-foreground text-sm">
                        @{props.hit.artistHandle}
                    </span>
                    <span className="text-muted-foreground text-sm">
                        {props.hit.price}
                    </span>
                </div>
            </Link>
        </CommandItem>
    )
}
