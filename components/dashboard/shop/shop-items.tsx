'use client'

import useSWR from 'swr'

import { GraphQLFetcher } from '@/core/helpers'
import { ShopItem } from '@/core/structures'

import ShopCard from '@/components/dashboard/shop/shop-card'
import Loading from '@/components/loading'
import { useDashboardContext } from '@/components/navigation/dashboard/dashboard-context'

export default function ShopItems() {
    const { artistId } = useDashboardContext()
    const { data, isLoading } = useSWR(
        `{
            artist(id: "${artistId}") {
                store_items {
                    featured_image
                    title
                    price
                    id
                    slug
                }
            }
        }`,
        GraphQLFetcher<{
            artist: {
                store_items: ShopItem[]
            }
        }>
    )

    if (isLoading) {
        return <Loading />
    }

    return (
        <div className="grid grid-cols-4 gap-4">
            {data?.artist.store_items?.map((product: ShopItem) => <ShopCard key={product.title} product={product} artist_id={artistId!} dashboard />)}
        </div>
    )
}
