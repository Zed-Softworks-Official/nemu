import React from 'react'

import Image from 'next/image'
import { PortfolioItem, PortfolioResponse } from '@/helpers/api/request-inerfaces'

export default async function Portfolio({ handle, id }: { handle: string; id: string }) {
    let res = await fetch(`/api/portfolio/${handle}/items`)
    let data: PortfolioResponse = await res.json()

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {data.items?.map((item: PortfolioItem) => {
                return (
                    <div key={item.name} className="w-fit h-fit">
                        <Image
                            src={item.signed_url}
                            alt={item.name}
                            width={300}
                            height={300}
                            className="rounded-3xl w-full"
                        />
                    </div>
                )
            })}
        </div>
    )
}
