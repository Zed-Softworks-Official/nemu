'use client'

import useSWR from 'swr'
import { notFound } from 'next/navigation'
import { GraphQLFetcher } from '@/core/helpers'

import ArtistBody from './body'
import ArtistHeader from './header'

import Loading from '../loading'
import { ArtistPageResponse } from '@/core/responses'

export default function ArtistPageClient({ handle }: { handle: string }) {
    const { data, isLoading } = useSWR(
        `{
        artist(handle: "${handle}") {
            headerPhoto
            profilePhoto
            handle
            about
            location
            commissions {
                title
                description
                price
                form_id
                featured_image
                availability
            }
            portfolio_items {
                signed_url
                name
            }
            socials {
                agent
                url
            }
            user {
                name
            }
        }
    }`,
        GraphQLFetcher<ArtistPageResponse>
    )

    if (isLoading) {
        return <Loading />
    }

    if (!data?.artist) {
        return notFound()
    }

    return (
        <>
            <ArtistHeader data={data} />
            <ArtistBody data={data} />
        </>
    )
}
