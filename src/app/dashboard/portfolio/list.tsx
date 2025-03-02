'use client'

import Link from 'next/link'
import NemuImage from '~/components/nemu-image'
import Loading from '~/components/ui/loading'
import { api } from '~/trpc/react'

export function PortfolioList() {
    const { data, isLoading } = api.portfolio.getPortfolioList.useQuery()

    if (isLoading) {
        return <Loading />
    }

    return (
        <div className="container mx-auto">
            <div className="columns-1 gap-4 sm:columns-2 xl:columns-3 2xl:columns-4">
                {data?.map((item) => (
                    <Link href={`/dashboard/portfolio/${item.id}`} key={item.id}>
                        <div className="mb-4 break-inside-avoid">
                            <div className="relative overflow-hidden rounded-lg">
                                <NemuImage
                                    src={item.image.url}
                                    alt={item.title}
                                    className="w-full object-cover transition-transform duration-300 hover:scale-105"
                                    width={300}
                                    height={300}
                                />
                                <div className="absolute right-0 bottom-0 left-0 bg-linear-to-t from-black/60 to-transparent p-4">
                                    <h3 className="text-lg font-semibold text-white">
                                        {item.title}
                                    </h3>
                                </div>
                            </div>
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    )
}
