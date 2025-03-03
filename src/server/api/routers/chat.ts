import { arrayContains } from 'drizzle-orm'

import { createTRPCRouter, protectedProcedure } from '~/server/api/trpc'
import { createId } from '@paralleldrive/cuid2'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { clerkClient } from '@clerk/nextjs/server'

import { chats } from '~/server/db/schema'
import { getRedisKey, redis } from '~/server/redis'
import type { Chat, Message } from '~/lib/types'
import { pusherServer } from '~/server/pusher'
import { toPusherKey } from '~/lib/utils'

export const chatRouter = createTRPCRouter({
    getChats: protectedProcedure.query(async ({ ctx }) => {
        const all_chats = await ctx.db.query.chats.findMany({
            where: arrayContains(chats.userIds, [ctx.auth.userId]),
            with: {
                commission: true,
                artist: true,
                request: true
            }
        })

        const result = await Promise.all(
            all_chats.map(async (chat) => {
                const clerk = await clerkClient()
                const [user_1, user_2] = chat.userIds
                if (!user_1 || !user_2) {
                    throw new TRPCError({
                        code: 'INTERNAL_SERVER_ERROR',
                        message: 'User not found'
                    })
                }

                const primary_user_promise = clerk.users.getUser(user_1)
                const secondary_user_promise = clerk.users.getUser(user_2)

                const [primary_user, secondary_user] = await Promise.all([
                    primary_user_promise,
                    secondary_user_promise
                ])

                return {
                    ...chat,
                    current_user: {
                        username:
                            ctx.auth.userId == chat.userIds[0]
                                ? primary_user.username
                                : secondary_user.username,
                        profile_image:
                            ctx.auth.userId == chat.userIds[0]
                                ? primary_user.imageUrl
                                : secondary_user.imageUrl
                    },
                    other_user: {
                        username:
                            ctx.auth.userId == chat.userIds[0]
                                ? secondary_user.username
                                : primary_user.username,
                        profile_image:
                            ctx.auth.userId == chat.userIds[0]
                                ? secondary_user.imageUrl
                                : primary_user.imageUrl
                    }
                }
            })
        )

        return result
    }),

    getChat: protectedProcedure
        .input(
            z.object({
                chatId: z.string()
            })
        )
        .mutation(async ({ ctx, input }) => {
            const clerk = await clerkClient()
            const redisKey = getRedisKey('chats', input.chatId)
            const chat: Chat | null = await redis.json.get(redisKey)

            if (!chat) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Chat not found'
                })
            }

            if (!chat.users.find((user) => user.userId === ctx.auth.userId)) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'User not found in chat'
                })
            }

            return {
                ...chat,
                users: await Promise.all(
                    chat.users.map(async (user) => {
                        const userData = await clerk.users.getUser(user.userId)

                        return {
                            userId: user.userId,
                            username: userData.username,
                            profileImage: userData.imageUrl
                        }
                    })
                )
            }
        }),

    sendMessage: protectedProcedure
        .input(
            z.object({
                chatId: z.string(),
                text: z.string().max(2000),
                type: z.enum(['text', 'image'])
            })
        )
        .mutation(async ({ ctx, input }) => {
            const redisKey = getRedisKey('chats', input.chatId)
            const chat: Chat | null = await redis.json.get(redisKey)

            if (!chat) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Chat not found'
                })
            }

            if (!chat.users.find((user) => user.userId === ctx.auth.userId)) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'User not found in chat'
                })
            }

            const clerk = await clerkClient()
            const message: Message = {
                id: createId(),
                type: input.type,
                sender: {
                    userId: ctx.auth.userId,
                    username:
                        (await clerk.users
                            .getUser(ctx.auth.userId)
                            .then((user) => user.username)) ?? 'Unknown User'
                },
                content: input.text,
                timestamp: Date.now()
            }

            await pusherServer.trigger(
                toPusherKey(`${input.chatId}:messages`),
                'message',
                message
            )

            await redis.json.arrappend(redisKey, '$.messages', message)
        })
})
