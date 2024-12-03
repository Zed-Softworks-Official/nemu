import { z } from 'zod'
import { createTRPCRouter, protectedProcedure } from '../trpc'
import { eq } from 'drizzle-orm'
import { kanbans, requests } from '~/server/db/schema'
import { UserRole, type KanbanContainerData, type KanbanTask } from '~/core/structures'
import { db } from '~/server/db'
import { clerkClient } from '@clerk/nextjs/server'
import { TRPCError } from '@trpc/server'

export const kanban_router = createTRPCRouter({
    get_kanban_messages: protectedProcedure
        .input(
            z.object({
                order_id: z.string()
            })
        )
        .query(async ({ ctx, input }) => {
            let request
            try {
                request = await ctx.db.query.requests.findFirst({
                    where: eq(requests.order_id, input.order_id),
                    with: {
                        kanban: true
                    }
                })
            } catch (e) {
                console.error('Failed to get request: ', e)
                return undefined
            }

            if (!request?.kanban?.id) {
                return undefined
            }

            return {
                id: request.kanban.id,
                containers: request.kanban.containers as KanbanContainerData[],
                tasks: request.kanban.tasks as KanbanTask[]
            }
        }),

    add_to_kanban: protectedProcedure
        .input(
            z.object({
                kanban_id: z.string(),
                container_id: z.string(),
                content: z.string()
            })
        )
        .mutation(async ({ input, ctx }) => {
            const clerk_client = await clerkClient()
            const user = await clerk_client.users.getUser(ctx.auth.userId)

            if ((user.publicMetadata.role as UserRole) !== UserRole.Artist) {
                throw new TRPCError({
                    code: 'UNAUTHORIZED',
                    message: 'Only artists can add to kanban'
                })
            }

            let kanban
            try {
                kanban = await ctx.db.query.kanbans.findFirst({
                    where: eq(kanbans.id, input.kanban_id)
                })
            } catch (e) {
                console.error('Failed to get kanban: ', e)
                return { success: false }
            }

            if (!kanban) {
                return { success: false }
            }

            // Add Item to kanban
            const prev_tasks: KanbanTask[] = kanban.tasks
                ? (kanban.tasks as KanbanTask[])
                : []

            try {
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
            } catch (e) {
                console.error('Failed to add to kanban: ', e)
                return { success: false }
            }

            return { success: true }
        })
})
