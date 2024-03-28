import { z } from 'zod'
import { protectedProcedure, publicProcedure } from '../trpc'
import { prisma } from '@/lib/prisma'
import { Role } from '@/core/structures'

/**
 * Gets an artist code form the database
 */
export const get_artist_code = publicProcedure.input(z.string()).query(async (opts) => {
    const { input } = opts

    const result = await prisma.aritstCode.findFirst({
        where: {
            code: input
        }
    })

    if (!result) {
        return { success: false }
    }

    return { success: true }
})

/**
 * Creates an artist code to add to the database
 */
export const set_artist_code = protectedProcedure.mutation(async (opts) => {
    const { ctx } = opts

    if (ctx.session.user.role != Role.Admin) {
        return { success: false }
    }

    const new_code = 'NEMU-' + crypto.randomUUID()

    const result = await prisma.aritstCode.create({
        data: {
            code: new_code
        }
    })

    if (!result) {
        return { success: false }
    }

    return { success: true, generated_code: new_code }
})
