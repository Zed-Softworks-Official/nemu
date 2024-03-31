'use client'

import Masonry, { ResponsiveMasonry } from 'react-responsive-masonry'
import ShopCard from '../dashboard/shop/shop-card'
import { ShopItem } from '@/core/structures'
import Loading from '../loading'
import { api } from '@/core/trpc/react'

export default function Shop({
    handle,
    artist_id
}: {
    handle: string
    artist_id: string
}) {
    const { data, isLoading } = api.artist_corner.get_products.useQuery({ artist_id })

    if (isLoading) {
        return <Loading />
    }

    return (
        <ResponsiveMasonry columnsCountBreakPoints={{ 350: 1, 900: 2, 1024: 3 }}>
            <Masonry gutter='3rem'>
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
