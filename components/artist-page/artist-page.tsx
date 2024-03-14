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
                id
                headerPhoto
                profilePhoto
                handle
                about
                location
                stripeAccount
                commissions {
                    title
                    description
                    price
                    form_id
                    featured_image
                    images
                    availability
                    commission_id
                    published
                    use_invoicing
                }
                products {
                    title
                    description
                    price
                    featured_image {
                        signed_url
                        blur_data
                    }
                    images {
                        signed_url
                        blur_data
                        image_key
                    }
                    id
                    slug
                    stripe_account
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
