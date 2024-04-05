import { z } from 'zod'
import { artistProcedure, createTRPCRouter, protectedProcedure } from '../trpc'
import { redis } from '@/lib/redis'
import { prisma } from '@/lib/prisma'
import { AsRedisKey } from '@/core/helpers'
import { Kanban } from '@prisma/client'
import { TRPCError } from '@trpc/server'

export const kanbanRouter = createTRPCRouter({
    /**
     * Gets a specific kanban given the ID of the kanban
     */
    get_kanban: protectedProcedure.input(z.string()).query(async (opts) => {
        const { input } = opts

        if (input.length === 0) {
            return undefined
        }

        const cachedKanban = await redis.get(AsRedisKey('kanbans', input))
        if (cachedKanban) {
            return JSON.parse(cachedKanban) as Kanban
        }

        const kanban = await prisma.kanban.findFirst({
            where: {
                id: input
            }
        })

        if (!kanban) {
            return undefined
        }

        await redis.set(AsRedisKey('kanbans', input), JSON.stringify(kanban), 'EX', 3600)

        return kanban
    }),

    /**
     * Updates a specific kanban with the containers and tasks given
     * the kanban ID
     */
    update_kanban: artistProcedure
        .input(
            z.object({
                kanban_id: z.string(),
                containers: z.array(
                    z.object({
                        id: z.union([z.string(), z.number()]),
                        title: z.string()
                    })
                ),
                tasks: z.array(
                    z.object({
                        id: z.union([z.string(), z.number()]),
                        container_id: z.union([z.string(), z.number()]),
                        content: z.string()
                    })
                )
            })
        )
        .mutation(async (opts) => {
            const { input } = opts

            const updated_kanban = await prisma.kanban.update({
                where: {
                    id: input.kanban_id
                },
                data: {
                    containers: JSON.stringify(input.containers),
                    tasks: JSON.stringify(input.tasks)
                }
            })

            if (!updated_kanban) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Could not update kanban'
                })
            }

            // Delete redis cache
            const submission = await prisma.request.findFirst({
                where: {
                    id: updated_kanban.requestId
                }
            })

            await redis.del(AsRedisKey('form_submissions', submission?.orderId!))

            return { success: true }
        }),

    /**
     * Adds a single item to the kanban given a kanban ID
     */
    add_task: artistProcedure
        .input(
            z.object({
                kanban_id: z.string(),
                new_task: z.object({
                    id: z.union([z.string(), z.number()]),
                    container_id: z.union([z.string(), z.number()]),
                    content: z.string()
                })
            })
        )
        .mutation(async (opts) => {
            const { input } = opts

            // Get Kanban
            const kanban = await prisma.kanban.findFirst({
                where: {
                    id: input.kanban_id
                }
            })

            if (!kanban) {
                return { success: false }
            }

            // Add the task to the database
            await prisma.kanban.update({
                where: {
                    id: input.kanban_id
                },
                data: {
                    tasks: JSON.stringify([...JSON.parse(kanban?.tasks!), input.new_task])
                }
            })

            return { success: true }
        })
})
