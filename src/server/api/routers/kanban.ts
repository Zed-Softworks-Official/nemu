import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import type { KanbanContainerData, KanbanTask } from '~/core/structures'
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

            if (!request?.kanban) {
                return undefined
            }

            return {
                id: request.kanban_id!,
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
            // Fetch Kanban from database
            const kanban = await ctx.db.query.kanbans.findFirst({
                where: eq(kanbans.id, input.kanban_id)
            })

            if (!kanban) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Kanban not found!'
                })
            }

            // // Add Item to Kanban
            const prev_tasks: KanbanTask[] = kanban.tasks
                ? (kanban.tasks as KanbanTask[])
                : []

            await ctx.db
                .update(kanbans)
                .set({
                    tasks: [
                        ...prev_tasks,
                        {
                            id: crypto.randomUUID(),
                            container_id: input.container_id,
                            content: input.content
                        }
                    ]
                })
                .where(eq(kanbans.id, kanban.id))
        })
})
