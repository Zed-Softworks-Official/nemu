'use client'

import { ShopItem } from '@/core/structures'
import Loading from '../loading'
import ShopDisplay from './shop-display'
import { api } from '@/core/api/react'

export default function ShopPageClient({
    handle,
    slug
}: {
    handle: string
    slug: string
}) {
    const { data, isLoading } = api.artist_corner.get_product.useQuery({
        slug,
        artist_handle: handle.substring(3, handle.length)
    })

    if (isLoading) {
        return <Loading />
    }

    return (
        <ShopDisplay
            handle={handle.substring(3, handle.length)}
            product={data as ShopItem}
            artist_id={data?.artist_id!}
        />
    )
}
