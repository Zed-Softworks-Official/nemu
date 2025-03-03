import { z } from 'zod'
import { artistProcedure, createTRPCRouter, protectedProcedure } from '../trpc'
import { eq } from 'drizzle-orm'
import { kanbans, requests } from '~/server/db/schema'
import { type KanbanContainerData, type KanbanTaskData } from '~/lib/types'
import { db } from '~/server/db'
import { TRPCError } from '@trpc/server'

export const kanbanRouter = createTRPCRouter({
    getKanbanMessages: protectedProcedure
        .input(
            z.object({
                orderId: z.string()
            })
        )
        .query(async ({ ctx, input }) => {
            const request = await ctx.db.query.requests.findFirst({
                where: eq(requests.orderId, input.orderId),
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
                tasks: request.kanban.tasks as KanbanTaskData[]
            }
        }),

    addToKanban: artistProcedure
        .input(
            z.object({
                kanbanId: z.string(),
                containerId: z.string(),
                content: z.string()
            })
        )
        .mutation(async ({ input, ctx }) => {
            const kanban = await ctx.db.query.kanbans.findFirst({
                where: eq(kanbans.id, input.kanbanId)
            })

            if (!kanban) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Kanban not found'
                })
            }

            // Add Item to kanban
            const prev_tasks: KanbanTaskData[] = kanban.tasks
                ? (kanban.tasks as KanbanTaskData[])
                : []

            await db
                .update(kanbans)
                .set({
                    tasks: [
                        ...prev_tasks,
                        {
                            id: crypto.randomUUID(),
                            containerId: input.containerId,
                            content: input.content
                        }
                    ]
                })
                .where(eq(kanbans.id, input.kanbanId))
        }),

    updateKanban: artistProcedure
        .input(
            z.object({
                kanbanId: z.string(),
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
                .where(eq(kanbans.id, input.kanbanId))
        })
})
