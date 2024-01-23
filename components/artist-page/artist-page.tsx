'use client'

import useSWR from 'swr'
import { notFound } from 'next/navigation'
import { fetcher } from '@/core/helpers'

import ArtistBody from './body'
import ArtistHeader from './header'

import Loading from '../loading'
import { ArtistPageResponse, StatusCode } from '@/core/responses'

export default function ArtistPageClient({ handle }: { handle: string }) {
    const { data, isLoading } = useSWR<ArtistPageResponse>(
        `/api/artist/page/${handle}`,
        fetcher
    )

    if (isLoading) {
        return <Loading />
    }

    if (data?.status != StatusCode.Success) {
        return notFound()
    }

    return (
        <>
            <ArtistHeader data={data} />
            <ArtistBody artist_info={data?.artist!} />
        </>
    )
}
