'use client'

import useSWR from 'swr'
import Link from 'next/link'
import Image from 'next/image'

import { fetcher } from '@/helpers/fetcher'
import { PortfolioItem, PortfolioResponse } from '@/helpers/api/request-inerfaces'
import { useDashboardContext } from '@/components/navigation/dashboard/dashboard-context'
import Loading from '@/components/loading'

export default function PortfolioItems() {
    const { handle } = useDashboardContext()
    const { data, isLoading } = useSWR<PortfolioResponse>(
        `/api/portfolio/${handle}/items`,
        fetcher
    )

    if (isLoading) {
        return <Loading />
    }

    return (
        <div className="grid grid-cols-4">
            {data?.items?.map((item: PortfolioItem) => {
                return (
                    <Link href={`/dashboard/portfolio/item/${item.key}`} key={item.key}>
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
    )
}
