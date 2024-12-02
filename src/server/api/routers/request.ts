import { clerkClient } from '@clerk/nextjs/server'
import { createTRPCRouter, protectedProcedure } from '../trpc'
import { eq, type InferSelectModel } from 'drizzle-orm'
import { z } from 'zod'

import { type downloads, requests } from '~/server/db/schema'
import type { ClientRequestData } from '~/core/structures'

export const request_router = createTRPCRouter({
    set_request: protectedProcedure
        .input(
            z.object({
                commission_id: z.string(),
                form_data: z.string()
            })
        )
        .mutation(async ({ ctx, input }) => {
            console.log(input)
        }),

    get_request_list: protectedProcedure.query(async ({ ctx }) => {
        const clerk_client = await clerkClient()
        const db_requests = await ctx.db.query.requests.findMany({
            where: eq(requests.user_id, ctx.auth.userId),
            with: {
                commission: {
                    with: {
                        artist: true
                    }
                }
            }
        })

        if (!db_requests) {
            return []
        }

        // Format for client
        const result: ClientRequestData[] = []
        for (const request of db_requests) {
            const user = await clerk_client.users.getUser(request.user_id)

            result.push({
                ...request,
                commission: {
                    ...request.commission,
                    images: [
                        {
                            url: request.commission.images[0]!.url
                        }
                    ]
                },
                user: {
                    id: request.user_id,
                    username: user.username ?? 'User'
                }
            })
        }

        return result
    }),

    get_request_by_id: protectedProcedure
        .input(
            z.object({
                order_id: z.string()
            })
        )
        .query(async ({ ctx, input }) => {
            const clerk_client = await clerkClient()
            const request = await ctx.db.query.requests.findFirst({
                where: eq(requests.order_id, input.order_id),
                with: {
                    commission: {
                        with: {
                            artist: true
                        }
                    },
                    download: true,
                    invoice: true,
                    kanban: true
                }
            })

            if (!request) {
                return undefined
            }

            let delivery:
                | (InferSelectModel<typeof downloads> & {
                      blur_data?: string
                      file_type: 'image' | 'zip'
                  })
                | undefined = undefined

            if (request.download) {
                const file_type: 'image' | 'zip' = request.download.url.includes('.zip')
                    ? 'zip'
                    : 'image'

                delivery = {
                    ...request.download,
                    file_type
                }
            }

            const user = await clerk_client.users.getUser(request.user_id)
            const result: ClientRequestData = {
                ...request,
                user: {
                    id: request.user_id,
                    username: user.username ?? 'User'
                },
                delivery,
                invoice: request.invoice ?? undefined,
                kanban: request.kanban ?? undefined
            }

            return result
        })
})
