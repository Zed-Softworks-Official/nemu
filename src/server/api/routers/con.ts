import { z } from 'zod'
import { createId } from '@paralleldrive/cuid2'

import {
    adminProcedure,
    createTRPCRouter,
    protectedProcedure,
    publicProcedure
} from '~/server/api/trpc'
import { con_sign_up } from '~/server/db/schema'
import { eq } from 'drizzle-orm'
import { cache, getRedisKey } from '~/server/redis'

export const conRouter = createTRPCRouter({
    setCon: adminProcedure
        .input(
            z.object({
                name: z.string(),
                expires_at: z.date()
            })
        )
        .mutation(async ({ ctx, input }) => {
            await ctx.db.insert(con_sign_up).values({
                id: createId(),
                name: input.name,
                slug: crypto.randomUUID(),
                expires_at: input.expires_at
            })
        }),

    getCons: protectedProcedure.query(async ({ ctx }) => {
        return await ctx.db.query.con_sign_up.findMany()
    }),

    getCon: protectedProcedure
        .input(
            z.object({
                id: z.string()
            })
        )
        .query(async ({ ctx, input }) => {
            return await ctx.db.query.con_sign_up.findFirst({
                where: eq(con_sign_up.id, input.id)
            })
        }),

    validSlug: publicProcedure
        .input(
            z.object({
                slug: z.string()
            })
        )
        .query(async ({ ctx, input }) => {
            return await cache(
                getRedisKey('con', input.slug),

                async () => {
                    const con = await ctx.db.query.con_sign_up.findFirst({
                        where: eq(con_sign_up.slug, input.slug)
                    })

                    if (!con) return null

                    return {
                        isValid: true,
                        isExpired: con.expires_at < new Date(),
                        name: con.name
                    }
                },
                300
            )
        })
})
