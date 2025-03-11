import Link from 'next/link'
import { Suspense } from 'react'

import { DashboardCreateButton } from '~/components/ui/button'
import NemuImage from '~/components/nemu-image'

import { api } from '~/trpc/server'
import { isOnboarded } from '~/lib/flags'

export default async function DashboardPortfolioPage() {
    const onboarded = await isOnboarded()

    return (
        <div className="container mx-auto px-5 py-10">
            <div className="mb-6 flex items-center justify-between">
                <h1 className="text-3xl font-bold">My Portfolio</h1>
                <DashboardCreateButton
                    onboarded={onboarded}
                    text="New Item"
                    href="/dashboard/portfolio/create"
                />
            </div>

            <Suspense>
                <PortfolioList />
            </Suspense>
        </div>
    )
}

async function PortfolioList() {
    const data = await api.portfolio.getPortfolioList()

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
