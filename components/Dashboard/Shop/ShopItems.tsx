'use client'

import useSWR from 'swr'

import { fetcher } from '@/helpers/fetcher'
import { useSession } from 'next-auth/react'
import Image from 'next/image'

export default function ShopItems() {
    const { data: session } = useSession()
    const { data } = useSWR(`/api/stripe/${session?.user.user_id}/product`, fetcher)

    return (
        <div className="grid grid-cols-4 gap-4">
            <div className="bg-charcoal rounded-xl overflow-hidden">
                <div>
                    <Image width={500} height={500} alt='Product image' src={data?.product.featured_image} />
                </div>
                <div className="p-5">
                    <h1>{data?.product.name}</h1>
                    <h2>${data?.product.price}</h2>
                </div>
            </div>
        </div>
    )
}
