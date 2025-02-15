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

export const con_router = createTRPCRouter({
    set_con: adminProcedure
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

    get_cons: protectedProcedure.query(async ({ ctx }) => {
        return await ctx.db.query.con_sign_up.findMany()
    }),

    get_con: protectedProcedure
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

    valid_slug: publicProcedure
        .input(
            z.object({
                slug: z.string()
            })
        )
        .query(async ({ ctx, input }) => {
            const con = await ctx.db.query.con_sign_up.findFirst({
                where: eq(con_sign_up.slug, input.slug)
            })

            if (!con) return null

            return {
                is_valid: true,
                is_expired: con.expires_at < new Date(),
                name: con.name
            }
        })
})
