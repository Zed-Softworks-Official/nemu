'use client'

import Masonry, { ResponsiveMasonry } from 'react-responsive-masonry'
import ShopCard from '../dashboard/shop/shop-card'
import { ShopItem } from '@/core/structures'
import { trpc } from '@/app/_trpc/client'
import Loading from '../loading'

export default function Shop({
    handle,
    artist_id
}: {
    handle: string
    artist_id: string
}) {
    const { data, isLoading, error } = trpc.get_products.useQuery({ artist_id })

    if (isLoading) {
        return <Loading />
    }

    return (
        <ResponsiveMasonry>
            <Masonry>
                {data?.map((item) => (
                    <ShopCard
                        key={item.id}
                        product={item as ShopItem}
                        handle={handle}
                        artist_id={artist_id}
                    />
                ))}
            </Masonry>
        </ResponsiveMasonry>
    )
}
