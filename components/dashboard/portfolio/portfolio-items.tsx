'use client'

import Link from 'next/link'
import Image from 'next/image'

import { PortfolioItem } from '@/core/structures'
import { useDashboardContext } from '@/components/navigation/dashboard/dashboard-context'
import Loading from '@/components/loading'

import Masonary, { ResponsiveMasonry } from 'react-responsive-masonry'
import { api } from '@/core/trpc/react'

export default function PortfolioItems() {
    const { artist } = useDashboardContext()!
    const { data, isLoading } = api.portfolio.get_portfolio_items.useQuery({
        artist_id: artist?.id!
    })

    if (isLoading) {
        return <Loading />
    }

    return (
        <ResponsiveMasonry columnsCountBreakPoints={{ 350: 1, 900: 2, 1024: 3, 1280: 4 }}>
            <Masonary gutter="3rem">
                {data?.map((item: PortfolioItem) => {
                    return (
                        <Link
                            href={`/dashboard/portfolio/item/${item.image_key}`}
                            key={item.name}
                            className="card bg-base-100 shadow-xl rounded-3xl transition-all duration-200 animate-pop-in"
                        >
                            <div>
                                <Image
                                    src={item.signed_url}
                                    alt={item.name}
                                    width={400}
                                    height={400}
                                    className="rounded-3xl rounded-b-none w-full"
                                />
                                <div className="card-body">
                                    <h2 className="text-center font-bold text-2xl">
                                        {item.name}
                                    </h2>
                                </div>
                            </div>
                        </Link>
                    )
                })}
            </Masonary>
        </ResponsiveMasonry>
    )
}
