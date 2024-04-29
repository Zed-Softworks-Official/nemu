import { z } from 'zod'
import { KanbanContainerData, KanbanTask } from '~/core/structures'
import { artistProcedure, createTRPCRouter, protectedProcedure } from '~/server/api/trpc'

export const kanbanRouter = createTRPCRouter({
    /**
     * Get a kanban by its request ID
     */
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

    /**
     * Retrieves kanban by sendbird channel id
     */
    get_kanban_messages: protectedProcedure
        .input(z.string())
        .mutation(async ({ input, ctx }) => {
            const request = await ctx.db.request.findFirst({
                where: {
                    sendbirdChannelURL: input
                },
                include: {
                    kanban: true
                }
            })

            if (!request || !request.kanban) {
                return undefined
            }

            const containers = JSON.parse(
                request.kanban.containers
            ) as KanbanContainerData[]
            const tasks = JSON.parse(request.kanban.tasks) as KanbanTask[]

            return {
                containers,
                tasks
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
            await ctx.db.kanban.update({
                where: {
                    id: input.kanban_id
                },
                data: {
                    containers: input.containers,
                    tasks: input.tasks
                }
            })
        })
})
