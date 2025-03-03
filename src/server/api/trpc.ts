/**
 * YOU PROBABLY DON'T NEED TO EDIT THIS FILE, UNLESS:
 * 1. You want to modify request context (see Part 1).
 * 2. You want to create a new middleware or type of procedure (see Part 3).
 *
 * TL;DR - This is where all the tRPC server stuff is created and plugged in. The pieces you will
 * need to use are documented accordingly near the end.
 */
import { auth, clerkClient } from '@clerk/nextjs/server'
import { initTRPC, TRPCError } from '@trpc/server'
import superjson from 'superjson'
import { ZodError } from 'zod'

import { db } from '~/server/db'
import { redis } from '~/server/redis'
import { artists } from '../db/schema'
import { eq } from 'drizzle-orm'
import { type UserRole } from '~/lib/types'

/**
 * 1. CONTEXT
 *
 * This section defines the "contexts" that are available in the backend API.
 *
 * These allow you to access things when processing a request, like the database, the session, etc.
 *
 * This helper generates the "internals" for a tRPC context. The API handler and RSC clients each
 * wrap this and provides the required context.
 *
 * @see https://trpc.io/docs/server/context
 */
export const createTRPCContext = (opts: { headers: Headers }) => {
    return {
        db,
        redis,
        ...opts
    }
}

/**
 * 2. INITIALIZATION
 *
 * This is where the tRPC API is initialized, connecting the context and transformer. We also parse
 * ZodErrors so that you get typesafety on the frontend if your procedure fails due to validation
 * errors on the backend.
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
 * Create a server-side caller.
 *
 * @see https://trpc.io/docs/server/server-side-calls
 */
export const createCallerFactory = t.createCallerFactory

/**
 * 3. ROUTER & PROCEDURE (THE IMPORTANT BIT)
 *
 * These are the pieces you use to build your tRPC API. You should import these a lot in the
 * "/src/server/api/routers" directory.
 */

/**
 * This is how you create new routers and sub-routers in your tRPC API.
 *
 * @see https://trpc.io/docs/router
 */
export const createTRPCRouter = t.router

/**
 * Middleware for timing procedure execution and adding an artificial delay in development.
 *
 * You can remove this if you don't like it, but it can help catch unwanted waterfalls by simulating
 * network latency that would occur in production but not in local development.
 */
const timingMiddleware = t.middleware(async ({ next, path }) => {
    const start = Date.now()

    if (t._config.isDev) {
        // artificial delay in dev
        const waitMs = Math.floor(Math.random() * 400) + 100
        await new Promise((resolve) => setTimeout(resolve, waitMs))
    }

    const result = await next()

    const end = Date.now()
    console.log(`[TRPC] ${path} took ${end - start}ms to execute`)

    return result
})

/**
 * Public (unauthenticated) procedure
 *
 * This is the base piece you use to build new queries and mutations on your tRPC API. It does not
 * guarantee that a user querying is authorized, but you can still access user session data if they
 * are logged in.
 */
export const publicProcedure = t.procedure.use(timingMiddleware)

/**
 * Protected (authenticated) procedure
 *
 * This is the base procedure for queries and mutations that require authentication. It verifies
 * that the user is logged in before proceeding. If not, it throws an unauthorized error.
 */
export const protectedProcedure = t.procedure
    .use(timingMiddleware)
    .use(async ({ next, ctx }) => {
        const auth_data = await auth()

        if (!auth_data.userId) {
            throw new TRPCError({
                message: 'Unauthorized',
                code: 'UNAUTHORIZED'
            })
        }

        return next({
            ctx: {
                ...ctx,
                auth: auth_data
            }
        })
    })

/**
 * Artist procedure
 *
 * This procedure extends the protected procedure to verify that the authenticated user
 * is also an artist in the system. It queries the database to find the artist record
 * and adds the artist's information to the context. If no artist is found, it throws
 * an unauthorized error.
 */
export const artistProcedure = protectedProcedure.use(async ({ next, ctx }) => {
    const artist = await ctx.db.query.artists.findFirst({
        where: eq(artists.userId, ctx.auth.userId)
    })

    if (!artist) {
        throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'Artist not found'
        })
    }

    return next({
        ctx: {
            ...ctx,
            artist: {
                ...artist
            }
        }
    })
})

/**
 * Admin procedure
 *
 * This procedure extends the protected procedure to verify that the authenticated user
 * is an admin in the system. It queries the database to find the user record and checks
 * their role. If the user is not found or does not have the admin role, it throws an
 * unauthorized error.
 */
export const adminProcedure = protectedProcedure.use(async ({ next, ctx }) => {
    const clerk = await clerkClient()
    const user = await clerk.users.getUser(ctx.auth.userId)

    if ((user.publicMetadata.role as UserRole) !== 'admin') {
        throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'User is not an admin'
        })
    }

    return next({
        ctx: {
            ...ctx,
            user: {
                ...user
            }
        }
    })
})
