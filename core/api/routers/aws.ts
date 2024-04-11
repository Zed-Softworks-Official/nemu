import { z } from 'zod'
import { createTRPCRouter, protectedProcedure } from '../trpc'
import { prisma } from '@/lib/prisma'
import { TRPCError } from '@trpc/server'
import { redis } from '@/lib/redis'
import { AsRedisKey } from '@/core/helpers'

/**
 * Handles updating the database for the reqeusted item
 */
export const awsRouter = createTRPCRouter({
    /**
     * Creates a new profile image
     */
    set_profile_image: protectedProcedure.input(z.string()).mutation(async (opts) => {
        const { input, ctx } = opts

        // Update Database
        const updated_user = await prisma.user.update({
            where: {
                id: ctx.session.user.id
            },
            data: {
                image: input
            }
        })

        if (!updated_user) {
            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Could not update user'
            })
        }

        await redis.del(AsRedisKey('users', ctx.session.user.id))
    })
})
