import { createTRPCRouter, protectedProcedure } from '~/server/api/trpc'
import { PublicUserMetadata, UserRole } from '~/core/structures'

import z from 'zod'
import { clerkClient } from '@clerk/nextjs/server'

export const userRouter = createTRPCRouter({
    /**
     * Updates a users information
     */
    update_user: protectedProcedure.mutation(async ({ ctx }) => {
        const publicMetadata: PublicUserMetadata = {
            role: UserRole.Standard,
            has_sendbird_account: false
        }

        const user = await clerkClient.users.updateUserMetadata(ctx.auth.userId, {
            publicMetadata
        })

        await ctx.db.user.create({
            data: {
                clerkId: user.id
            }
        })

        return { success: true }
    }),

    /**
     * Add username to user
     */
    add_username: protectedProcedure.mutation(async ({ ctx }) => {
        await clerkClient.users.updateUser(ctx.auth.userId, {
            username: ctx.user.firstName!
        })

        return { success: true }
    })
})
