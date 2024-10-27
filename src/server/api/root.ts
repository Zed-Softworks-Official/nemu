import { createCallerFactory, createTRPCRouter } from '~/server/api/trpc'

import { userRouter } from '~/server/api/routers/user'
import { stripeRouter } from '~/server/api/routers/stripe'
import { verificationRouter } from '~/server/api/routers/verification'
import { formRouter } from '~/server/api/routers/form'
import { requestRouter } from '~/server/api/routers/requests'
import { kanbanRouter } from '~/server/api/routers/kanban'

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
    verification: verificationRouter,
    requests: requestRouter,
    form: formRouter,
    stripe: stripeRouter,
    kanban: kanbanRouter,
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
