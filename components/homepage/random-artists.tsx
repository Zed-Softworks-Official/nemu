'use client'

import { RandomArtistsResponse } from '@/helpers/api/request-inerfaces'
import { fetcher } from '@/helpers/fetcher'
import useSWR from 'swr'
import Loading from '../loading'
import Image from 'next/image'
import Link from 'next/link'

export default function RandomArtists() {
    const { data, isLoading } = useSWR<RandomArtistsResponse>(
        `/api/artist/random`,
        fetcher
    )

    if (isLoading) {
        return <Loading />
    }

    return (
        <div className="my-10">
            <h1>Artists</h1>
            <div className="grid grid-cols-4 gap-5">
                {data?.artists?.map((artist) => (
                    <Link href={`/@${artist.handle}`} key={artist.handle}>
                        <div className="bg-fullwhite dark:bg-fullblack rounded-3xl overflow-hidden">
                            <Image
                                src={artist.headerPhoto}
                                width={500}
                                height={500}
                                alt="Header Photo"
                                className="object-cover w-full h-52 overflow-hidden"
                            />
                            <div className="p-5">
                                <Image
                                    src={
                                        artist.profilePhoto
                                            ? artist.profilePhoto
                                            : '/profile.png'
                                    }
                                    width={50}
                                    height={50}
                                    alt="profile photo"
                                    className="rounded-full inline-block relative -top-10 left-5"
                                />
                                <h1 className="text-lg inline-block float-right">
                                    @{artist.handle}
                                </h1>
                                <p className="my-3">{artist.about}</p>
                            </div>
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    )
}
