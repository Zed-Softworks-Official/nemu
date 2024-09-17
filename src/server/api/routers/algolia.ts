import { clerkClient } from '@clerk/nextjs/server'
import { del_index, set_index } from '~/core/search'
import { format_to_currency } from '~/lib/utils'
import { adminProcedure, createTRPCRouter } from '~/server/api/trpc'

export const algoliaRouter = createTRPCRouter({
    /**
     * Loads all of the artists from the database and updates the algolia indicies
     */
    load_artists: adminProcedure.mutation(async ({ ctx }) => {
        // Get all artists from the database
        const db_artists = await ctx.db.query.artists.findMany()

        // Format for algolia and upadate algolia
        for (const artist of db_artists) {
            await del_index('artists', artist.id)

            await set_index('artists', {
                objectID: artist.id,
                handle: artist.handle,
                about: artist.about,
                image_url: (await clerkClient().users.getUser(artist.user_id)).imageUrl
            })
        }
    }),

    /**
     * Loads all of the commissions from the database and updates the algolia indicies
     */
    load_commissions: adminProcedure.mutation(async ({ ctx }) => {
        // Get all commissions from the database
        const db_commissions = await ctx.db.query.commissions.findMany({
            with: {
                artist: true
            }
        })

        // Format for algolia and upadate algolia
        for (const commission of db_commissions) {
            await del_index('commissions', commission.id)

            await set_index('commissions', {
                objectID: commission.id,
                title: commission.title,
                price: format_to_currency(commission.price / 100),
                description: commission.description,
                featured_image: commission.images[0]!.url,
                slug: commission.slug,
                published: commission.published,
                artist_handle: commission.artist.handle
            })
        }
    })
})
