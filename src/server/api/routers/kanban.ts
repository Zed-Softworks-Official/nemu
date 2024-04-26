import { z } from 'zod'
import { artistProcedure, createTRPCRouter, protectedProcedure } from '~/server/api/trpc'

export const kanbanRouter = createTRPCRouter({
    get_kanban: protectedProcedure.input(z.string()).query(async ({ input, ctx }) => {
        const kanban = await ctx.db.kanban.findFirst({
            where: {
                requestId: input
            }
        })

        if (!kanban) {
            return undefined
        }

        return kanban
    }),

    set_kanban: artistProcedure
        .input(
            z.object({
                kanban_id: z.string(),
                containers: z.string(),
                tasks: z.string()
            })
        )
        .mutation(async ({ input, ctx }) => {})
})
