'use client'

import { notFound } from 'next/navigation'

import ArtistBody from './body'
import ArtistHeader from './header'

import Loading from '../loading'
import { trpc } from '@/app/_trpc/client'

export default function ArtistPageClient({ handle }: { handle: string }) {
    const { data, isLoading, error } = trpc.get_artist.useQuery({ handle })

    if (isLoading) {
        return <Loading />
    }

    if (error) {
        return notFound()
    }

    return (
        <>
            <ArtistHeader data={data} />
            <ArtistBody data={data} />
        </>
    )
}
