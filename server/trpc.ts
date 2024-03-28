import { getServerAuthSession } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { initTRPC, TRPCError } from '@trpc/server'
import { ZodError } from 'zod'

export const createTRPCContext = async (opts: { headers: Headers }) => {
    const session = await getServerAuthSession()

    return { prisma, session, ...opts }
}

const t = initTRPC.context<typeof createTRPCContext>().create({
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

export const router = t.router

export const publicProcedure = t.procedure

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
