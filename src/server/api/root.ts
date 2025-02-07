import { createCallerFactory, createTRPCRouter } from '~/server/api/trpc'

import { artist_verification_router } from '~/server/api/routers/artist-verification'
import { stripe_router } from '~/server/api/routers/stripe'
import { kanban_router } from '~/server/api/routers/kanban'
import { request_router } from '~/server/api/routers/request'
import { commission_router } from '~/server/api/routers/commission'
import { artist_router } from '~/server/api/routers/artist'
import { chat_router } from '~/server/api/routers/chat'
import { portfolio_router } from '~/server/api/routers/portfolio'
import { home_router } from '~/server/api/routers/home'
import { dashboard_router } from '~/server/api/routers/dashboard'

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */

export const appRouter = createTRPCRouter({
    artist: artist_router,
    artist_verification: artist_verification_router,
    stripe: stripe_router,
    kanban: kanban_router,
    request: request_router,
    commission: commission_router,
    chat: chat_router,
    portfolio: portfolio_router,
    home: home_router,
    dashboard: dashboard_router
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
