'use client'

import useSWR from 'swr'

import { fetcher } from '@/helpers/fetcher'
import { useSession } from 'next-auth/react'

import { ShopItem } from '@/helpers/api/request-inerfaces'

import ShopCard from '@/components/dashboard/shop/shop-card'

export default function ShopItems() {
    const { data: session } = useSession()
    const { data } = useSWR(`/api/stripe/${session?.user.user_id}/products`, fetcher)

    return (
        <div className="grid grid-cols-4 gap-4">
            {data?.products.map((product: ShopItem) => (
                <ShopCard product={product} dashboard />
            ))}
        </div>
    )
}
