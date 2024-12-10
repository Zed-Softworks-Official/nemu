import { createCallerFactory, createTRPCRouter } from '~/server/api/trpc'

import { artist_verification_router } from './routers/artist-verification'
import { supporter_router } from './routers/supporter'
import { stripe_router } from './routers/stripe'
import { kanban_router } from './routers/kanban'
import { request_router } from './routers/request'
import { commission_router } from './routers/commission'
import { artist_router } from './routers/artist'
import { chat_router } from './routers/chat'

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
    artist: artist_router,
    artist_verification: artist_verification_router,
    supporter: supporter_router,
    stripe: stripe_router,
    kanban: kanban_router,
    request: request_router,
    commission: commission_router,
    chat: chat_router
})

// export type definition of API
export type AppRouter = typeof appRouter

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.post.all();
 *       ^? Post[]
 */
export const createCaller = createCallerFactory(appRouter)
