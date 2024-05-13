import { clerkClient } from '@clerk/nextjs/server'
import { ArtistIndex, set_index } from '~/core/search'
import { adminProcedure, createTRPCRouter } from '~/server/api/trpc'

export const algoliaRouter = createTRPCRouter({
    set_artist: adminProcedure.mutation(async ({ ctx }) => {
        // Get all artists from the database
        const db_artists = await ctx.db.query.artists.findMany()

        // Format for algolia and upadate algolia
        for (const artist of db_artists) {
            await set_index('artists', {
                objectID: artist.id,
                handle: artist.handle,
                about: artist.about,
                image_url: (await clerkClient.users.getUser(artist.user_id)).imageUrl
            })
        }
    })
})
