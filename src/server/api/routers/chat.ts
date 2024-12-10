import { eq } from 'drizzle-orm'

import { createTRPCRouter, protectedProcedure } from '~/server/api/trpc'
import { chats } from '~/server/db/schema'
import { z } from 'zod'
import { clerkClient } from '@clerk/nextjs/server'
import { get_redis_key, redis } from '~/server/redis'
import type { Chat, Message } from '~/core/structures'
import { TRPCError } from '@trpc/server'
import { createId } from '@paralleldrive/cuid2'
import { pusher_server } from '~/server/pusher'
import { to_pusher_key } from '~/lib/utils'

export const chat_router = createTRPCRouter({
    get_chats: protectedProcedure.query(async ({ ctx }) => {
        const all_chats = await ctx.db.query.chats.findMany({
            where: eq(chats.user_id, ctx.auth.userId),
            with: {
                commission: true,
                artist: true,
                request: true
            }
        })

        const result = await Promise.all(
            all_chats.map(async (chat) => {
                const is_artist = chat.artist.user_id === ctx.auth.userId

                const clerk_client = await clerkClient()
                const user_promise = clerk_client.users.getUser(chat.user_id)
                const artist_promise = clerk_client.users.getUser(chat.artist.user_id)

                const [user, artist] = await Promise.all([user_promise, artist_promise])

                return {
                    ...chat,
                    current_user: {
                        username: is_artist ? artist.username : user.username,
                        profile_image: is_artist ? artist.imageUrl : user.imageUrl
                    },
                    other_user: {
                        username: is_artist ? user.username : artist.username,
                        profile_image: is_artist ? user.imageUrl : artist.imageUrl
                    }
                }
            })
        )

        return result
    }),

    get_chat: protectedProcedure
        .input(
            z.object({
                chat_id: z.string()
            })
        )
        .mutation(async ({ ctx, input }) => {
            const clerk_client = await clerkClient()
            const redis_key = get_redis_key('chats', input.chat_id)
            const chat: Chat | null = await redis.json.get(redis_key)

            if (!chat) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Chat not found'
                })
            }

            if (!chat.users.find((user) => user.user_id === ctx.auth.userId)) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'User not found in chat'
                })
            }

            return {
                ...chat,
                users: await Promise.all(
                    chat.users.map(async (user) => {
                        const user_data = await clerk_client.users.getUser(user.user_id)

                        return {
                            user_id: user.user_id,
                            username: user_data.username,
                            profile_image: user_data.imageUrl
                        }
                    })
                )
            }
        }),

    send_message: protectedProcedure
        .input(
            z.object({
                chat_id: z.string(),
                text: z.string().max(2000),
                type: z.enum(['text', 'image'])
            })
        )
        .mutation(async ({ ctx, input }) => {
            const redis_key = get_redis_key('chats', input.chat_id)
            const chat: Chat | null = await redis.json.get(redis_key)

            if (!chat) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Chat not found'
                })
            }

            if (!chat.users.find((user) => user.user_id === ctx.auth.userId)) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'User not found in chat'
                })
            }

            const clerk_client = await clerkClient()
            const message: Message = {
                id: createId(),
                type: input.type,
                sender: {
                    user_id: ctx.auth.userId,
                    username:
                        (await clerk_client.users
                            .getUser(ctx.auth.userId)
                            .then((user) => user.username)) ?? 'Unknown User'
                },
                content: input.text,
                timestamp: Date.now()
            }

            pusher_server.trigger(
                to_pusher_key(`${input.chat_id}:messages`),
                'message',
                message
            )

            await redis.json.arrappend(redis_key, '$.messages', message)
        })
})
