'use client'

import { RandomArtistsResponse } from '@/core/responses'
import { Fetcher } from '@/core/helpers'
import useSWR from 'swr'
import Link from 'next/link'
import ArtistsSkeleton from '../skeleton/homepage/artists-skeleton'
import NemuImage from '../nemu-image'

export default function RandomArtists() {
    const { data, isLoading } = useSWR<RandomArtistsResponse>(
        `/api/artist/random`,
        Fetcher
    )

    if (isLoading) {
        return <ArtistsSkeleton />
    }

    return (
        <div className="flex flex-col gap-5">
            <div className="prose mt-5 mx-5">
                <h1>Artists</h1>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
                {data?.artists?.map((artist) => (
                    <Link
                        href={`/@${artist.handle}`}
                        key={artist.handle}
                        className="w-full h-full btn btn-ghost hover:bg-transparent"
                    >
                        <div className="card rounded-xl bg-base-300 shadow-xl">
                            <figure>
                                <NemuImage
                                    src={artist.headerPhoto}
                                    width={500}
                                    height={500}
                                    alt="Header Photo"
                                    className="object-cover w-full h-52 overflow-hidden"
                                />
                            </figure>
                            <div className="card-body">
                                <div className="relative w-full">
                                    <NemuImage
                                        src={
                                            artist.profilePhoto
                                                ? artist.profilePhoto
                                                : '/profile.png'
                                        }
                                        width={50}
                                        height={50}
                                        alt="profile photo"
                                        className="avatar rounded-full absolute left-0 -top-14"
                                    />
                                </div>
                                <h1 className="card-title">@{artist.handle}</h1>
                                <p className="text-base-content/80 text-left">
                                    {artist.about}
                                </p>
                            </div>
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    )
}
