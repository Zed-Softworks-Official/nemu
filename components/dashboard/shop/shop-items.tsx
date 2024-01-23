'use client'

import useSWR from 'swr'

import { fetcher } from '@/core/helpers'
import { useSession } from 'next-auth/react'

import { ShopItem, ShopResponse } from '@/core/responses'

import ShopCard from '@/components/dashboard/shop/shop-card'
import Loading from '@/components/loading'

export default function ShopItems() {
    const { data: session } = useSession()
    const { data, isLoading } = useSWR<ShopResponse>(
        `/api/stripe/${session?.user.user_id}/products`,
        fetcher
    )

    if (isLoading) {
        return <Loading />
    }

    return (
        <div className="grid grid-cols-4 gap-4">
            {data?.products?.map((product: ShopItem) => (
                <ShopCard key={product.name} product={product} dashboard />
            ))}
        </div>
    )
}
