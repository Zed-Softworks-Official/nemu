import { createCallerFactory, createTRPCRouter } from '~/server/api/trpc'

import { artist_verification_router } from './routers/artist-verification'
import { supporter_router } from './routers/supporter'
import { stripe_router } from './routers/stripe'

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
    artist_verification: artist_verification_router,
    supporter: supporter_router,
    stripe: stripe_router
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
