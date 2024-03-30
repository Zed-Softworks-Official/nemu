import { createTRPCRouter, createCallerFactory } from './trpc'

import { artistRouter } from './routers/artist'
import { commissionsRouter } from './routers/commission'
import { artistCornerRouter } from './routers/product'
import { portfolioRouter } from './routers/portfolio'
import { artistCodeRouter } from './routers/artist-code'
import { formsRouter } from './routers/form'
import { userRouter } from './routers/user'
import { invoicesRouter } from './routers/invoice'
import { stripeRouter } from './routers/stripe'
import { kanbanRouter } from './routers/kanban'
import { verificationRouter } from './routers/verification'

/**
 * Primary tRPC Router
 */
export const appRouter = createTRPCRouter({
    artist: artistRouter,
    commissions: commissionsRouter,
    artist_corner: artistCornerRouter,
    portfolio: portfolioRouter,
    artist_code: artistCodeRouter,
    form: formsRouter,
    user: userRouter,
    invoices: invoicesRouter,
    stripe: stripeRouter,
    kanban: kanbanRouter,
    verification: verificationRouter
})

/**
 * Export Type definintion of API
 */
export type AppRouter = typeof appRouter

/**
 * Create a server-side caller for the tRPC API
 *
 * @example
 * const trpc = createCaller(createContext)
 * const res = await trpc.post.all()
 */
export const createCaller = createCallerFactory(appRouter)
