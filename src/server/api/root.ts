import { createCallerFactory, createTRPCRouter } from '~/server/api/trpc'

import { userRouter } from '~/server/api/routers/user'
import { artistRouter } from '~/server/api/routers/artist'
import { commissionRouter } from '~/server/api/routers/commission'
import { stripeRouter } from '~/server/api/routers/stripe'
import { portfolioRouter } from '~/server/api/routers/portfolio'

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
    artist: artistRouter,
    commission: commissionRouter,
    portfolio: portfolioRouter,
    stripe: stripeRouter,
    user: userRouter
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
