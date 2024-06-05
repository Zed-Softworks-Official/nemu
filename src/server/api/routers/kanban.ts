import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { KanbanContainerData, KanbanTask } from '~/core/structures'
import { artistProcedure, createTRPCRouter, protectedProcedure } from '~/server/api/trpc'
import { kanbans, requests } from '~/server/db/schema'

export const kanbanRouter = createTRPCRouter({
    /**
     * Get a kanban by its request ID
     */
    get_kanban: protectedProcedure.input(z.string()).query(async ({ input, ctx }) => {
        const kanban = await ctx.db.query.kanbans.findFirst({
            where: eq(kanbans.request_id, input)
        })

        if (!kanban) {
            return undefined
        }

        return kanban
    }),

    /**
     * Retrieves kanban by sendbird channel id
     */
    get_kanban_messages: protectedProcedure
        .input(z.string())
        .mutation(async ({ input, ctx }) => {
            const request = await ctx.db.query.requests.findFirst({
                where: eq(requests.sendbird_channel_url, input),
                with: {
                    kanban: true
                }
            })

            if (!request || !request.kanban) {
                return undefined
            }

            return {
                id: request.kanban_id,
                containers: request.kanban.containers as KanbanContainerData[],
                tasks: request.kanban.tasks as KanbanTask[]
            }
        }),

    /**
     * Updates a kanban
     */
    set_kanban: artistProcedure
        .input(
            z.object({
                kanban_id: z.string(),
                containers: z.string(),
                tasks: z.string()
            })
        )
        .mutation(async ({ input, ctx }) => {
            await ctx.db
                .update(kanbans)
                .set({
                    containers: JSON.parse(input.containers),
                    tasks: JSON.parse(input.tasks)
                })
                .where(eq(kanbans.id, input.kanban_id))
        }),

    /**
     *
     */
    add_to_kanban: artistProcedure
        .input(
            z.object({
                kanban_id: z.string(),
                container_id: z.string(),
                content: z.string()
            })
        )
        .mutation(async ({ input, ctx }) => {
            console.log(input)
        })
})
