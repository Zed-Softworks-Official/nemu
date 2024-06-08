import Link from 'next/link'
import { EyeIcon } from 'lucide-react'

import { format_to_currency, get_availability_badge_data } from '~/lib/utils'

import NemuImage from '~/components/nemu-image'
import { Badge } from '~/components/ui/badge'
import Price from '~/components/ui/price'
import { unstable_cache } from 'next/cache'
import { db } from '~/server/db'
import { commissions } from '~/server/db/schema'
import { ClientCommissionItem, CommissionAvailability } from '~/core/structures'
import { get_blur_data } from '~/lib/blur_data'
import { eq } from 'drizzle-orm'
import { AsRedisKey, cache } from '~/server/cache'

const get_commissions = unstable_cache(
    async (artist_id: string) => {
        const cachedCommissions = await cache.json.get(
            AsRedisKey('commissions', artist_id)
        )

        if (cachedCommissions) {
            return cachedCommissions as ClientCommissionItem[]
        }

        const db_commissions = await db.query.commissions.findMany({
            where: eq(commissions.artist_id, artist_id),
            with: {
                artist: true
            }
        })

        if (!db_commissions) {
            return undefined
        }

        // Format for client
        const result: ClientCommissionItem[] = []
        for (const commission of db_commissions) {
            result.push({
                title: commission.title,
                description: commission.description,
                price: format_to_currency(Number(commission.price)),
                availability: commission.availability as CommissionAvailability,
                rating: Number(commission.rating),
                published: commission.published,
                images: [
                    {
                        url: commission.images[0]?.url!,
                        blur_data: await get_blur_data(commission.images[0]?.url!)
                    }
                ],
                slug: commission.slug,
                artist: {
                    handle: commission.artist.handle,
                    supporter: commission.artist.supporter
                }
            })
        }

        await cache.json.set(AsRedisKey('commissions', artist_id), '$', result)

        return result
    },
    ['commission_list'],
    {
        tags: ['commission', 'commission_list']
    }
)

export default async function CommissionsList({
    artist_id,
    handle
}: {
    artist_id: string
    handle: string
}) {
    const data = await get_commissions(artist_id)

    if (!data) {
        return <></>
    }

    return (
        <div className="grid w-full grid-cols-1 gap-5">
            {data.map((commission) => {
                // If the item hasn't hasn't been published, don't show it
                if (!commission.published) {
                    return null
                }

                const [variant, text] = get_availability_badge_data(
                    commission.availability
                )

                return (
                    <div
                        key={commission.slug}
                        className="card animate-pop-in bg-base-100 shadow-xl transition-all duration-200 ease-in-out lg:card-side"
                    >
                        <figure className="w-64">
                            <NemuImage
                                src={commission.images[0]!.url}
                                placeholder="blur"
                                blurDataURL={commission.images[0]!.blur_data}
                                alt="Featured Image"
                                width={400}
                                height={400}
                                className="h-full w-full"
                            />
                        </figure>
                        <div className="card-body">
                            <h2 className="flex items-center gap-2 text-3xl font-bold">
                                {commission.title}
                                <Badge variant={variant} className="badge-lg">
                                    {text}
                                </Badge>
                            </h2>
                            <div className="divider"></div>
                            <p>{commission.description}</p>
                            <div className="flex items-end justify-between">
                                <Price value={commission.price} />
                                <Link
                                    className="btn btn-primary text-white"
                                    href={`/@${handle}/commission/${commission.slug}`}
                                    scroll={false}
                                >
                                    <EyeIcon className="h-6 w-6" />
                                    View
                                </Link>
                            </div>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
