import { createCallerFactory, createTRPCRouter } from '~/server/api/trpc'

import { artistVerificationRouter } from '~/server/api/routers/artist-verification'
import { stripeRouter } from '~/server/api/routers/stripe'
import { kanbanRouter } from '~/server/api/routers/kanban'
import { requestRouter } from '~/server/api/routers/request'
import { commissionRouter } from '~/server/api/routers/commission'
import { artistRouter } from '~/server/api/routers/artist'
import { chatRouter } from '~/server/api/routers/chat'
import { portfolioRouter } from '~/server/api/routers/portfolio'
import { homeRouter } from '~/server/api/routers/home'
import { dashboardRouter } from '~/server/api/routers/dashboard'
import { conRouter } from '~/server/api/routers/con'
import { artistCornerRouter } from '~/server/api/routers/artist-corner'

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
    artist: artistRouter,
    artistVerification: artistVerificationRouter,
    stripe: stripeRouter,
    kanban: kanbanRouter,
    request: requestRouter,
    commission: commissionRouter,
    chat: chatRouter,
    portfolio: portfolioRouter,
    home: homeRouter,
    dashboard: dashboardRouter,
    con: conRouter,
    artistCorner: artistCornerRouter
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
