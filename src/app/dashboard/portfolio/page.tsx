import NemuImage from '~/components/nemu-image'

import Link from 'next/link'
import Masonry from '~/components/ui/masonry'
import { currentUser } from '@clerk/nextjs/server'
import { Suspense } from 'react'
import Loading from '~/components/ui/loading'
import { unstable_cache } from 'next/cache'
import { db } from '~/server/db'
import { eq } from 'drizzle-orm'
import { portfolios } from '~/server/db/schema'
import { get_blur_data } from '~/lib/blur_data'
import type { ClientPortfolioItem } from '~/core/structures'

const get_portfolio_list = unstable_cache(
    async (artist_id: string) => {
        const portfolio_items = await db.query.portfolios.findMany({
            where: eq(portfolios.artist_id, artist_id)
        })

        if (!portfolio_items) {
            return []
        }

        const result: ClientPortfolioItem[] = []
        for (const portfolio of portfolio_items) {
            result.push({
                ...portfolio,
                image: {
                    url: portfolio.image_url,
                    blur_data: await get_blur_data(portfolio.image_url)
                }
            })
        }

        return result
    },
    ['portfolio_list'],
    {
        tags: ['portfolio', 'portfolio_list']
    }
)

export default function PortfolioDashboardPage() {
    return (
        <Suspense fallback={<Loading />}>
            <PageContent />
        </Suspense>
    )
}

async function PageContent() {
    const user = await currentUser()
    const portfolio_items = await get_portfolio_list(
        user!.privateMetadata.artist_id as string
    )

    return (
        <div className="container mx-auto mt-3 p-10">
            <Masonry columns={'4'}>
                {portfolio_items.map((item) => (
                    <div
                        key={item.id}
                        className="animate-pop-in transition-all duration-200 ease-in-out active:scale-95"
                    >
                        <Link href={`/dashboard/portfolio/${item.id}`}>
                            <NemuImage
                                src={item.image.url}
                                alt="image"
                                width={500}
                                height={500}
                                className="h-full w-full rounded-xl"
                            />
                        </Link>
                    </div>
                ))}
            </Masonry>
        </div>
    )
}
