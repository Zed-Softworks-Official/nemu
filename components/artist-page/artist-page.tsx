'use client'

import useSWR from 'swr'
import { notFound } from 'next/navigation'
import { fetcher } from '@/helpers/fetcher'

import ArtistBody from './body'
import ArtistHeader from './header'

import Loading from '../loading'
import { ArtistPageResponse, StatusCode } from '@/helpers/api/request-inerfaces'

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
