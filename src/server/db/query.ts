import { unstable_cache } from 'next/cache'
import { and, eq, type InferSelectModel } from 'drizzle-orm'

import { artists, commissions, portfolios } from './schema'
import { db } from '.'
import { env } from '~/env'
import { clerkClient } from '@clerk/nextjs/server'
import {
    type NemuImageData,
    type ClientCommissionItem,
    type CommissionAvailability
} from '~/core/structures'
import { format_to_currency } from '~/lib/utils'

type ArtistData = InferSelectModel<typeof artists> & {
    user: {
        username: string
        profile_picture: string
    }
    header: NemuImageData
}

export const get_artist_data = unstable_cache(
    async (handle: string) => {
        const clerk_client = await clerkClient()
        const artist = await db.query.artists.findFirst({
            where: eq(artists.handle, handle)
        })

        if (!artist) {
            return null
        }

        const header_photo = artist.ut_key
            ? artist.header_photo
            : `${env.BASE_URL}${artist.header_photo}`

        const user = await clerk_client.users.getUser(artist.user_id)

        return {
            ...artist,
            user: {
                username: user.username ?? 'Nemu Jr',
                profile_picture: user.imageUrl
            },
            header: {
                url: header_photo
            }
        } satisfies ArtistData
    },
    ['artist_data'],
    {
        tags: ['artist_data'],
        revalidate: 3600
    }
)

export const get_commission_list = unstable_cache(
    async (artist_id: string) => {
        return await db.query.commissions.findMany({
            where: eq(commissions.artist_id, artist_id)
        })
    },
    ['commission_list'],
    {
        tags: ['commission_list'],
        revalidate: 3600
    }
)

export const get_portfolio_list = unstable_cache(
    async (artist_id: string) => {
        return await db.query.portfolios.findMany({
            where: eq(portfolios.artist_id, artist_id)
        })
    },
    ['portfolio_list'],
    {
        tags: ['portfolio_list'],
        revalidate: 3600
    }
)

//////////////////////////////////////////////////////////
// Commission Data
//////////////////////////////////////////////////////////

export const get_commission = unstable_cache(
    async (handle: string, slug: string) => {
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
        const images: NemuImageData[] = commission.images.map((image) => ({
            url: image.url
        }))

        const result: ClientCommissionItem = {
            title: commission.title,
            description: commission.description,
            price: format_to_currency(Number(commission.price / 100)),
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

        return result
    },
    ['commission'],
    { tags: ['commission'] }
)
