import { unstable_cache } from 'next/cache'
import { eq, type InferSelectModel } from 'drizzle-orm'

import { artists, commissions, portfolios } from './schema'
import { db } from '.'
import type { NemuImageData } from '~/types/image'
import { env } from '~/env'
import { clerkClient } from '@clerk/nextjs/server'

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
