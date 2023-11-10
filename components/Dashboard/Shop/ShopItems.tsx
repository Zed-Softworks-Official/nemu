'use client'

import useSWR from 'swr'
import Image from 'next/image'

import { fetcher } from '@/helpers/fetcher'
import { useSession } from 'next-auth/react'
import { ShopItem } from '@/helpers/api/request-inerfaces'

export default function ShopItems() {
    const { data: session } = useSession()
    const { data } = useSWR(`/api/stripe/${session?.user.user_id}/products`, fetcher)

    return (
        <div className="grid grid-cols-4 gap-4">
            {data?.products.map((product: ShopItem) => (
                <div key={product.name} className="bg-charcoal rounded-xl overflow-hidden">
                    <div>
                        <Image width={500} height={500} alt='Product image' src={product.featured_image} />
                    </div>
                    <div className="p-5">
                        <h1>{product.name}</h1>
                        <h2>${product.price}</h2>
                    </div>
                </div>
            ))}
        </div>
    )
}
