import { z } from 'zod'

import {
    adminProcedure,
    createTRPCRouter,
    protectedProcedure,
    publicProcedure
} from '~/server/api/trpc'
import { artist_codes, artist_verifications, artists } from '~/server/db/schema'
import { createId } from '@paralleldrive/cuid2'
import { count, eq } from 'drizzle-orm'

/**
 * The Actual Vrification Router
 */
export const verificationRouter = createTRPCRouter({
    /**
     * Checks the requested handle to make sure nobody else has requested it,
     * since we can only have one of each
     */
    handle_exists: protectedProcedure
        .input(z.string())
        .mutation(async ({ input, ctx }) => {
            // check handle inside artists
            const artist_handle_exists = await ctx.db
                .select({ count: count() })
                .from(artists)
                .where(eq(artists.handle, input))

            for (const handle of artist_handle_exists) {
                if (handle.count != 0) {
                    return { exists: true }
                }
            }

            // check handle inside of verification table
            const verification_handle_exists = await ctx.db
                .select({ count: count() })
                .from(artist_verifications)
                .where(eq(artist_verifications.requested_handle, input))

            for (const handle of verification_handle_exists) {
                if (handle.count != 0) {
                    return { exists: true }
                }
            }

            return { exists: false }
        }),

    /**
     * Gets an artist code form the database
     */
    get_artist_code: publicProcedure
        .input(z.string())
        .mutation(async ({ input, ctx }) => {
            const result = await ctx.db.query.artist_codes.findFirst({
                where: eq(artist_codes.code, input)
            })

            if (!result) {
                return { success: false }
            }

            return { success: true }
        }),

    /**
     * Creates an artist code to add to the database
     */
    set_artist_code: adminProcedure.input(z.number()).mutation(async ({ input, ctx }) => {
        const result: string[] = []

        for (let i = 0; i < input; i++) {
            const new_code = 'NEMU-' + crypto.randomUUID()

            await ctx.db.insert(artist_codes).values({
                id: createId(),
                code: new_code
            })

            result.push(new_code)
        }

        return result
    })
})
