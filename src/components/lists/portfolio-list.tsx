import { eq } from 'drizzle-orm'
import { unstable_cache } from 'next/cache'
import NemuImage from '~/components/nemu-image'
import Masonry from '~/components/ui/masonry'
import type { ClientPortfolioItem } from '~/core/structures'
import { get_blur_data } from '~/lib/blur_data'
import { AsRedisKey, cache } from '~/server/cache'
import { db } from '~/server/db'
import { portfolios } from '~/server/db/schema'

const get_portfolio_list = unstable_cache(
    async (artist_id: string) => {
        const cachedPortfolioItems = await cache.json.get(
            AsRedisKey('portfolios', artist_id)
        )

        if (cachedPortfolioItems) {
            return cachedPortfolioItems as ClientPortfolioItem[]
        }

        const portfolioItems = await db.query.portfolios.findMany({
            where: eq(portfolios.artist_id, artist_id)
        })

        // Format for client
        const result: ClientPortfolioItem[] = []
        for (const portfolio of portfolioItems) {
            result.push({
                id: portfolio.id,
                title: portfolio.title,
                image: {
                    url: portfolio.image_url,
                    blur_data: await get_blur_data(portfolio.image_url)
                }
            })
        }

        await cache.json.set(AsRedisKey('portfolios', artist_id), '$', result)

        return result
    },
    ['portfolio_list'],
    {
        tags: ['portfolio_list']
    }
)

export default async function PortfolioList({ artist_id }: { artist_id: string }) {
    const portfolio = await get_portfolio_list(artist_id)

    return (
        <Masonry columns={'4'}>
            {portfolio.map((item) => (
                <NemuImage
                    key={item.id}
                    src={item.image.url}
                    placeholder="blur"
                    blurDataURL={item.image.blur_data}
                    alt={item.title}
                    className="animate-pop-in rounded-xl transition-all duration-200 ease-in-out"
                    width={400}
                    height={400}
                />
            ))}
        </Masonry>
    )
}
