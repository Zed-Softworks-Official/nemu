import React from 'react'

import { PortfolioResponse } from '@/core/responses'
import { PortfolioItem } from '@/core/structures'
import NemuImage from '../nemu-image'

export default async function Portfolio({ handle, id }: { handle: string; id: string }) {
    let res = await fetch(`/api/portfolio/${handle}/items`)
    let data: PortfolioResponse = await res.json()

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {data.items?.map((item: PortfolioItem) => {
                return (
                    <div
                        key={item.name}
                        className="bg-base-100 w-fit h-fit rounded-xl animate-pop-in transition-all duration-200"
                    >
                        <NemuImage
                            src={item.signed_url}
                            alt={item.name}
                            width={300}
                            height={300}
                            className="rounded-xl w-full"
                        />
                    </div>
                )
            })}
        </div>
    )
}
