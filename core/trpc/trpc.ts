import { getServerAuthSession } from '@/app/api/auth/[...nextauth]/route'
import { Role } from '@/core/structures'
import superjson from 'superjson'
import { initTRPC, TRPCError } from '@trpc/server'
import { ZodError } from 'zod'

/**
 * CONTEXT
 *
 * Create the TRPC Context for later use in the backend
 */
export const createTRPCContext = async (opts: { headers: Headers | undefined }) => {
    const session = await getServerAuthSession()

    return { session, ...opts }
}

/**
 * INTIALIZE
 *
 * Initialzie tRPC api and connects the context and transfformer
 * Parsing ZodErrors also occurse here for typesafety on the frontend
 */
const t = initTRPC.context<typeof createTRPCContext>().create({
    transformer: superjson,
    errorFormatter({ shape, error }) {
        return {
            ...shape,
            data: {
                ...shape.data,
                zodError: error.cause instanceof ZodError ? error.cause.flatten() : null
            }
        }
    }
})

/**
 * Create server-side caller
 */

export const createCallerFactory = t.createCallerFactory

/**
 * ROUTES & PROCEDURES
 *
 * The main stuff for tRPC
 */
export const createTRPCRouter = t.router

/**
 * Public (unauthenticated) procedure
 */
export const publicProcedure = t.procedure

/**
 * Protected (authenticated) procedure
 */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
    if (!ctx.session || !ctx.session.user) {
        throw new TRPCError({ code: 'UNAUTHORIZED' })
    }

    return next({
        ctx: {
            session: { ...ctx.session, user: ctx.session.user }
        }
    })
})

/**
 * Protected (authenticated) procedure used only for artists
 */
export const artistProcedure = t.procedure.use(({ ctx, next }) => {
    if (!ctx.session || !ctx.session.user) {
        throw new TRPCError({ code: 'UNAUTHORIZED' })
    }

    if (ctx.session.user.role != Role.Artist) {
        throw new TRPCError({ code: 'UNAUTHORIZED' })
    }

    return next({
        ctx: {
            session: { ...ctx.session, user: ctx.session.user }
        }
    })
})

/**
 * Protected (authenticated) procedure used only for admins
 */
export const adminProcedure = t.procedure.use(({ ctx, next }) => {
    if (!ctx.session || !ctx.session.user) {
        throw new TRPCError({ code: 'UNAUTHORIZED' })
    }

    if (ctx.session.user.role != Role.Admin) {
        throw new TRPCError({ code: 'UNAUTHORIZED' })
    }

    return next({
        ctx: {
            session: { ...ctx.session, user: ctx.session.user }
        }
    })
})
