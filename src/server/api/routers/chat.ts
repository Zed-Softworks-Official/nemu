import { createTRPCRouter, protectedProcedure } from '~/server/api/trpc'

export const chat_router = createTRPCRouter({
    get_chats: protectedProcedure.query(async ({ ctx }) => {
        return null
    })
})
