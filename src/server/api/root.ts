import { createCallerFactory, createTRPCRouter } from '~/server/api/trpc'

import { userRouter } from '~/server/api/routers/user'
import { artistRouter } from '~/server/api/routers/artist'
import { commissionRouter } from '~/server/api/routers/commission'
import { stripeRouter } from '~/server/api/routers/stripe'
import { portfolioRouter } from '~/server/api/routers/portfolio'
import { verificationRouter } from '~/server/api/routers/verification'
import { formRouter } from '~/server/api/routers/form'
import { requestRouter } from '~/server/api/routers/requests'
import { kanbanRouter } from '~/server/api/routers/kanban'
import { algoliaRouter } from '~/server/api/routers/algolia'
import { downloadsRouter } from '~/server/api/routers/downloads'
import { invoiceRouter } from '~/server/api/routers/invoice'

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
    artist: artistRouter,
    verification: verificationRouter,
    commission: commissionRouter,
    requests: requestRouter,
    form: formRouter,
    portfolio: portfolioRouter,
    stripe: stripeRouter,
    kanban: kanbanRouter,
    user: userRouter,
    algolia: algoliaRouter,
    downloads: downloadsRouter,
    invoice: invoiceRouter
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
