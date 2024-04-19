import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure } from '~/server/api/trpc'
import { Artist, User } from '@prisma/client'
import { UserRole } from '~/core/structures'
import { AsRedisKey } from '~/server/cache'

import z from 'zod'

export const userRouter = createTRPCRouter({
    /**
     * Gets the currently logged in user
     */
    get_user: protectedProcedure.query(async ({ ctx }) => {
        const cachedUser = await ctx.cache.get(AsRedisKey('users', ctx.session.user.id))

        if (cachedUser) {
            return JSON.parse(cachedUser) as
                | { user: User; artist: Artist | undefined }
                | undefined
        }

        const user = await ctx.db.user.findFirst({
            where: {
                id: ctx.session.user.id
            }
        })

        if (!user) {
            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Could not find user'
            })
        }

        // Get Signed Url for profile photo
        if (!user.image) {
            user.image = '/profile.png'
        }

        if (ctx.session.user.role !== UserRole.Artist) {
            await ctx.cache.set(
                AsRedisKey('users', ctx.session.user.id!),
                JSON.stringify({ user: user }),
                'EX',
                3600
            )

            return {
                user,
                artist: undefined
            }
        }

        const artist = await ctx.db.artist.findFirst({
            where: {
                userId: ctx.session.user.id
            }
        })

        if (!artist) {
            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Could not find artist with that userId'
            })
        }

        await ctx.cache.set(
            AsRedisKey('users', ctx.session.user.id),
            JSON.stringify({ user, artist }),
            'EX',
            3600
        )

        return { user, artist }
    }),

    /**
     * Updates a users information
     */
    update_user: protectedProcedure
        .input(
            z.object({
                username: z.string().optional(),
                email: z.string().email().optional()
            })
        )
        .mutation(async ({ input, ctx }) => {
            const updated_user = await ctx.db.user.update({
                where: {
                    id: ctx.session.user.id
                },
                data: {
                    name: input.username,
                    email: input.email
                }
            })

            if (!updated_user) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Unable to update user account!'
                })
            }

            await ctx.cache.del(AsRedisKey('users', ctx.session.user.id!))

            return { success: true }
        }),

    /**
     * Update the users username
     */
    set_username: protectedProcedure
        .input(z.string())
        .mutation(async ({ input, ctx }) => {
            // Update the username
            const username_set = await ctx.db.user.update({
                where: {
                    id: ctx.session.user.id
                },
                data: {
                    name: input
                }
            })

            if (!username_set) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Could not set username!'
                })
            }

            return { success: true }
        })
})
