'use client'

import { ShopItem } from '@/core/structures'

import ShopCard from '@/components/dashboard/shop/shop-card'
import Loading from '@/components/loading'
import { useDashboardContext } from '@/components/navigation/dashboard/dashboard-context'
import { api } from '@/core/trpc/react'

export default function ShopItems() {
    const { artist } = useDashboardContext()!
    const { data, isLoading } = api.artist_corner.get_products.useQuery({
        artist_id: artist?.id!
    })

    if (isLoading) {
        return <Loading />
    }

    return (
        <div className="grid grid-cols-4 gap-4">
            {data?.map((product) => (
                <ShopCard
                    key={product.title}
                    product={product as ShopItem}
                    artist_id={artist?.id!}
                    dashboard
                />
            ))}
        </div>
    )
}
