'use client'

import useSWR from 'swr'
import Link from 'next/link'
import Image from 'next/image'

import { GraphQLFetcher } from '@/core/helpers'
import { PortfolioResponse } from '@/core/responses'
import { PortfolioItem } from '@/core/structures'
import { useDashboardContext } from '@/components/navigation/dashboard/dashboard-context'
import Loading from '@/components/loading'

export default function PortfolioItems() {
    const artistId = "65317d6a76c7a2516b6100dd"
    const { data, isLoading } = useSWR(
        `{
            artist(id: "${artistId}") {
              portfolioItems {
                signed_url,
                name
              }
            }
          }`,
        GraphQLFetcher
    )

    if (isLoading) {
        return <Loading />
    }

    return (
        <div className="flex gap-5">
            {(data as PortfolioResponse).artist.portfolio_items?.map((item: PortfolioItem) => {
                return (
                    <Link
                    // /dashboard/portfolio/item/${item.key}
                        href={`/`}
                        key={item.name}
                        className="card bg-base-100 shadow-xl rounded-3xl w-fit h-fit transition-all duration-200 animate-pop-in"
                    >
                        <div>
                            <Image
                                src={item.signed_url}
                                alt={item.name}
                                width={400}
                                height={400}
                                className="rounded-3xl rounded-b-none"
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
        </div>
    )
}
