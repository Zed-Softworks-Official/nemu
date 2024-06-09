import { and, eq } from 'drizzle-orm'
import { unstable_cache } from 'next/cache'
import { Suspense } from 'react'
import CommissionDisplay from '~/components/displays/commission/display'
import Loading from '~/components/ui/loading'
import { ClientCommissionItem, CommissionAvailability } from '~/core/structures'
import { convert_images_to_nemu_images } from '~/lib/server-utils'
import { format_to_currency } from '~/lib/utils'
import { AsRedisKey, cache } from '~/server/cache'
import { db } from '~/server/db'
import { artists, commissions } from '~/server/db/schema'

export const get_commission = unstable_cache(
    async (handle: string, slug: string) => {
        const cachedCommission = await cache.json.get(
            AsRedisKey('commissions', handle, slug)
        )

        if (cachedCommission) {
            return cachedCommission as ClientCommissionItem
        }

        // Get the artist from the db to fetch the commission
        const artist = await db.query.artists.findFirst({
            where: eq(artists.handle, handle)
        })

        if (!artist) {
            return undefined
        }

        // Get commission from db
        const commission = await db.query.commissions.findFirst({
            where: and(eq(commissions.slug, slug), eq(commissions.artist_id, artist.id))
        })

        if (!commission) {
            return undefined
        }

        // Format images for client
        const images = await convert_images_to_nemu_images(commission.images)
        const result: ClientCommissionItem = {
            title: commission.title,
            description: commission.description,
            price: format_to_currency(Number(commission.price)),
            availability: commission.availability as CommissionAvailability,
            rating: Number(commission.rating),
            images: images,
            slug: commission.slug,
            published: commission.published,

            id: commission.id,
            form_id: commission.form_id,

            artist: {
                handle: artist.handle,
                supporter: artist.supporter,
                terms: artist.terms
            }
        }

        await cache.json.set(AsRedisKey('commissions', handle, slug), '$', result)

        return result
    },
    ['commission'],
    { tags: ['commission'] }
)

export default function CommissionsPage({
    params
}: {
    params: { handle: string; slug: string }
}) {
    const handle = params.handle.substring(3, params.handle.length + 1)

    return (
        <div className="card bg-base-300 shadow-xl">
            <div className="card-body">
                <Suspense fallback={<Loading />}>
                    <PageContent handle={handle} slug={params.slug} />
                </Suspense>
            </div>
        </div>
    )
}

async function PageContent(props: { handle: string; slug: string }) {
    const commission = await get_commission(props.handle, props.slug)

    return <CommissionDisplay commission={commission} />
}
