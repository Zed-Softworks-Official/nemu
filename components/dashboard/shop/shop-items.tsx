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
                products {
                    featured_image {
                        signed_url
                        blur_data
                        image_key
                    }
                    title
                    price
                    id
                    slug
                }
            }
        }`,
        GraphQLFetcher<{
            artist: {
                products: ShopItem[]
            }
        }>
    )

    if (isLoading) {
        return <Loading />
    }

    return (
        <div className="grid grid-cols-4 gap-4">
            {data?.artist.products?.map((product: ShopItem) => <ShopCard key={product.title} product={product} artist_id={artistId!} dashboard />)}
        </div>
    )
}
