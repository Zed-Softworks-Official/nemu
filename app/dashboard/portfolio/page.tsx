'use client'

import useSWR from 'swr'
import React from 'react'
import Link from 'next/link'
import Image from 'next/image'

import { useDashboardContext } from '@/components/Navigation/Dashboard/DashboardContext'
import { PortfolioItem } from '@/helpers/api/request-inerfaces'
import { fetcher } from '@/helpers/fetcher'

import DashboardContainer from '@/components/Dashboard/DashboardContainer'

export default function PortfolioComponent() {
    const { handle, userId } = useDashboardContext()
    const { data } = useSWR(
        `/api/artist/items/${handle}/portfolio/${userId}`,
        fetcher
    )

    return (
        <DashboardContainer
            title="Portfolio"
            addButtonUrl="/dashboard/portfolio/add"
        >
            <div className="grid grid-cols-4">
                {data?.portfolio_items.map((item: PortfolioItem) => {
                    return (
                        <Link
                            href={`/dashboard/portfolio/item/${item.key}`}
                            key={item.key}
                        >
                            <div className="w-fit h-fit m-5 dark:bg-charcoal bg-white rounded-3xl pb-5">
                                <Image
                                    src={item.signed_url}
                                    alt={item.name}
                                    width={400}
                                    height={400}
                                    className="rounded-3xl rounded-b-none"
                                />
                                <div className="pt-5">
                                    <h2 className="text-center font-bold text-2xl">
                                        {item.name}
                                    </h2>
                                </div>
                            </div>
                        </Link>
                    )
                })}
            </div>
        </DashboardContainer>
    )
}
