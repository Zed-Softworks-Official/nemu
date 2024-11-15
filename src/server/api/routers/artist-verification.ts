import { z } from 'zod'
import { createTRPCRouter, protectedProcedure } from '../trpc'
import { clerkClient } from '@clerk/nextjs/server'
import { revalidateTag } from 'next/cache'
import { createId } from '@paralleldrive/cuid2'

import { UserRole } from '~/core/structures'
import { artist_codes } from '~/server/db/schema'
import { TRPCError } from '@trpc/server'

export const artist_verification_router = createTRPCRouter({
    generate_artist_code: protectedProcedure
        .input(
            z.object({
                amount: z.number().min(1).max(100)
            })
        )
        .mutation(async ({ input, ctx }) => {
            // Check if the user is an admin
            const clerk_client = await clerkClient()
            const user = await clerk_client.users.getUser(ctx.auth.userId)

            if (user.publicMetadata.role !== UserRole.Admin) {
                throw new TRPCError({
                    code: 'UNAUTHORIZED'
                })
            }

            // Create the new artist codes
            const codes = Array.from({ length: input.amount }, () => ({
                id: createId(),
                code: 'NEMU-' + crypto.randomUUID()
            }))

            // Batch insert all codes in a single database operation
            await ctx.db.insert(artist_codes).values(codes)

            // Extract just the code strings for the result
            const result = codes.map((code) => code.code)

            revalidateTag('artist_codes')

            return { success: true, codes: result }
        })
})
