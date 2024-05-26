import { clerkClient } from '@clerk/nextjs/server'
import { del_index, set_index } from '~/core/search'
import { adminProcedure, createTRPCRouter } from '~/server/api/trpc'

export const algoliaRouter = createTRPCRouter({
    /**
     * Loads all of the artists from the database and updates the algolia indicies
     */
    load_artists: adminProcedure.mutation(async ({ ctx }) => {
        // Get all artists from the database
        const db_artists = await ctx.db.query.artists.findMany()

        // Wipe Algolia Indicies
        await db_artists.map(async (artist) => {
            await del_index('artists', artist.id)
        })

        // Format for algolia and upadate algolia
        for (const artist of db_artists) {
            await set_index('artists', {
                objectID: artist.id,
                handle: artist.handle,
                about: artist.about,
                image_url: (await clerkClient.users.getUser(artist.user_id)).imageUrl
            })
        }
    }),

    /**
     * Loads all of the commissions from the database and updates the algolia indicies
     */
    load_commissions: adminProcedure.mutation(async ({ ctx }) => {
        // Get all commissions from the database
        const db_commissions = await ctx.db.query.commissions.findMany()

        // Wipe Algolia Indicies
        await db_commissions.map(async (artist) => {
            await del_index('artists', artist.id)
        })

        // Format for algolia and upadate algolia
        for (const commission of db_commissions) {
            await set_index('commissions', {
                objectID: commission.id,
                title: commission.title,
                price: commission.price,
                description: commission.description,
                featured_image: commission.images[0]?.url!,
                slug: commission.slug
            })
        }
    })
})
