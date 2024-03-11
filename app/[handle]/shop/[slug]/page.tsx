'use client'

import DefaultPageLayout from '@/app/(default)/layout'
import ShopDisplay from '@/components/artist-page/shop-display'
import Loading from '@/components/loading'
import { GraphQLFetcher } from '@/core/helpers'
import { ShopItem } from '@/core/structures'
import useSWR from 'swr'

export default function ArtistShopView({ params }: { params: { handle: string; slug: string } }) {
    
    const { data, isLoading } = useSWR(
        `{
            artist(handle:"${params.handle.substring(3, params.handle.length)}") {
                id
                handle
                store_item(slug: "${params.slug}") {
                    title
                    description
                    featured_image
                    images
                    price
                    id
                    stripe_account
                }
            }
        }`,
        GraphQLFetcher<{
            artist: {
                id: string
                handle: string
                store_item: ShopItem
            }
        }>
    )

    if (isLoading) {
        return <Loading />
    }

    return (
        <DefaultPageLayout>
            <ShopDisplay handle={data?.artist.handle!} product={data?.artist.store_item!} artist_id={data?.artist.id!} />
        </DefaultPageLayout>
    )
}
