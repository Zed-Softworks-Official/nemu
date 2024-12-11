import { z } from 'zod'
import { artistProcedure, createTRPCRouter, protectedProcedure } from '../trpc'
import { eq } from 'drizzle-orm'
import { kanbans, requests } from '~/server/db/schema'
import { type KanbanContainerData, type KanbanTask } from '~/core/structures'
import { db } from '~/server/db'
import { TRPCError } from '@trpc/server'

export const kanban_router = createTRPCRouter({
    get_kanban_messages: protectedProcedure
        .input(
            z.object({
                order_id: z.string()
            })
        )
        .query(async ({ ctx, input }) => {
            const request = await ctx.db.query.requests.findFirst({
                where: eq(requests.order_id, input.order_id),
                with: {
                    kanban: true
                }
            })

            if (!request?.kanban?.id) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Kanban not found'
                })
            }

            return {
                id: request.kanban.id,
                containers: request.kanban.containers as KanbanContainerData[],
                tasks: request.kanban.tasks as KanbanTask[]
            }
        }),

    add_to_kanban: artistProcedure
        .input(
            z.object({
                kanban_id: z.string(),
                container_id: z.string(),
                content: z.string()
            })
        )
        .mutation(async ({ input, ctx }) => {
            const kanban = await ctx.db.query.kanbans.findFirst({
                where: eq(kanbans.id, input.kanban_id)
            })

            if (!kanban) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Kanban not found'
                })
            }

            // Add Item to kanban
            const prev_tasks: KanbanTask[] = kanban.tasks
                ? (kanban.tasks as KanbanTask[])
                : []

            await db
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
                .where(eq(kanbans.id, input.kanban_id))
        }),

    update_kanban: artistProcedure
        .input(
            z.object({
                kanban_id: z.string(),
                containers: z.string(),
                tasks: z.string()
            })
        )
        .mutation(async ({ ctx, input }) => {
            await ctx.db
                .update(kanbans)
                .set({
                    containers: input.containers,
                    tasks: input.tasks
                })
                .where(eq(kanbans.id, input.kanban_id))
        })
})
