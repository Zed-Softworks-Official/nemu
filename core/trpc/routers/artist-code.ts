import { z } from 'zod'
import { adminProcedure, createTRPCRouter, publicProcedure } from '../trpc'
import { prisma } from '@/lib/prisma'
import { TRPCError } from '@trpc/server'

export const artistCodeRouter = createTRPCRouter({
    /**
     * Gets an artist code form the database
     */
    get_artist_code: publicProcedure.input(z.string()).mutation(async (opts) => {
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
    }),

    /**
     * Creates an artist code to add to the database
     */
    set_artist_code: adminProcedure.mutation(async (opts) => {
        const new_code = 'NEMU-' + crypto.randomUUID()

        const result = await prisma.aritstCode.create({
            data: {
                code: new_code
            }
        })

        if (!result) {
            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Could not generate artist code!'
            })
        }

        return { generated_code: new_code }
    })
})
