import React from 'react'

import ShopCard from '../dashboard/shop/shop-card'
import { ShopItem } from '@/helpers/api/request-inerfaces'

export default async function Shop({ user_id }: { user_id: string }) {
    let res = await fetch(`/api/stripe/${user_id}/products`)
    let data = await res.json()

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {data.products.map((item: ShopItem) => (
                <ShopCard key={item.name} product={item} />
            ))}
        </div>
    )
}
