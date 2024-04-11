'use client'

import NemuImage from '@/components/nemu-image'
import { FormatNumberToCurrency } from '@/core/helpers'
import { ChevronRightIcon } from 'lucide-react'
import Link from 'next/link'

export function ArtistSearchResult({
    item_name,
    url,
    avatar
}: {
    item_name: string
    url?: string
    avatar?: string
}) {
    return (
        <Link href={url || '#'}>
            <div className="flex items-center justify-between w-full">
                <div className="flex justify-center items-center gap-5">
                    {avatar && (
                        <NemuImage
                            className="avatar rounded-full"
                            src={avatar}
                            alt="profile picture"
                            width={50}
                            height={50}
                        />
                    )}
                    <p>{item_name}</p>
                </div>
                <ChevronRightIcon className="w-6 h-6" />
            </div>
        </Link>
    )
}

export function CommissionSearchResult({
    title,
    featured_image,
    price,
    artist_handle
}: {
    title: string
    featured_image: string
    price: number
    artist_handle: string
}) {
    // const { data, isLoading } = useSWR(``, GraphQLFetcher)

    return (
        <Link
            href={`/@${artist_handle}`}
            className="card lg:card-side w-full hover:bg-base-100 cursor-pointer"
        >
            <figure>
                {/* <NemuImage
                    src={featured_image}
                    alt="featured image"
                    width={100}
                    height={100}
                /> */}
            </figure>
            <div className="card-body flex-row justify-between items-center w-full">
                <div className="flex flex-col justify-start items-center">
                    <h2 className="card-title">{title}</h2>
                    <p className="text-md text-base-content/80">By @{artist_handle}</p>
                </div>
                <div className="flex gap-5 items-center">
                    <p className="text-lg font-bold">{FormatNumberToCurrency(price)}</p>
                    <ChevronRightIcon className="w-6 h-6" />
                </div>
            </div>
        </Link>
    )
}
