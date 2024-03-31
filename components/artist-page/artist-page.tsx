'use client'

import { notFound } from 'next/navigation'

import ArtistBody from './body'
import ArtistHeader from './header'

import Loading from '../loading'
import { api } from '@/core/trpc/react'

export default function ArtistPageClient({ handle }: { handle: string }) {
    const { data, isLoading, error } = api.artist.get_artist.useQuery({ handle })

    if (isLoading) {
        return <Loading />
    }

    if (error) {
        return notFound()
    }

    return (
        <>
            
        </>
    )
}
