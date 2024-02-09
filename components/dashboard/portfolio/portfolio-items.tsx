'use client'

import useSWR from 'swr'
import Link from 'next/link'
import Image from 'next/image'

import { GraphQLFetcher } from '@/core/helpers'
import { PortfolioResponse } from '@/core/responses'
import { PortfolioItem } from '@/core/structures'
import { useDashboardContext } from '@/components/navigation/dashboard/dashboard-context'
import Loading from '@/components/loading'

import Masonary, { ResponsiveMasonry } from 'react-responsive-masonry'

export default function PortfolioItems() {
    const { artistId } = useDashboardContext()
    const { data, isLoading } = useSWR(
        `{
            artist(id: "${artistId}") {
                portfolio_items {
                    signed_url
                    image_key
                    name
                }
            }
        }`,
        GraphQLFetcher<PortfolioResponse>
    )

    if (isLoading) {
        return <Loading />
    }

    return (
        <ResponsiveMasonry columnsCountBreakPoints={{ 350: 1, 900: 2, 1024: 3, 1280: 4 }}>
            <Masonary gutter="3rem">
                {data?.artist?.portfolio_items.map((item: PortfolioItem) => {
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
