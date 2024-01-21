import React from 'react'

import { PortfolioItem, PortfolioResponse } from '@/helpers/api/request-inerfaces'
import NemuImage from '../nemu-image'

export default async function Portfolio({ handle, id }: { handle: string; id: string }) {
    let res = await fetch(`/api/portfolio/${handle}/items`)
    let data: PortfolioResponse = await res.json()

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {data.items?.map((item: PortfolioItem) => {
                return (
                    <div key={item.name} className="transition-all bg-base-300 w-fit h-fit">
                        <NemuImage
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
