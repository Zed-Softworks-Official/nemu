'use client'

import { ArtistResponse } from '@/helpers/api/request-inerfaces'
import { fetcher } from '@/helpers/fetcher'
import useSWR from 'swr'
import ArtistHeader from './header'
import ArtistBody from './body'
import Loading from '../loading'

export default function ArtistPageClient({ id }: { id: string }) {
    const { data, isLoading } = useSWR<ArtistResponse>(`/api/artist/${id}`, fetcher)

    if (isLoading) {
        return <Loading />
    }
    
    return (
        <>
            <ArtistHeader handle={data?.info?.handle!} id={data?.info?.userId!} />
            <ArtistBody artist_info={data?.info!} />
        </>
    )
}
