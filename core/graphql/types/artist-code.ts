import { prisma } from '@/lib/prisma'
import { builder } from '../builder'
import { StatusCode } from '@/core/responses'

/**
 * Artist Code Object
 */
builder.prismaObject('AritstCode', {
    fields: (t) => ({
        id: t.exposeString('id'),
        code: t.exposeString('code')
    })
})

/**
 * Gets all artist codes
 */
builder.queryField('artist_codes', (t) =>
    t.prismaField({
        type: ['AritstCode'],
        resolve: (query, _parent, _args, _ctx, _info) =>
            prisma.aritstCode.findMany({ ...query })
    })
)

/**
 * Finds one specific artist code
 */
builder.queryField('artist_code', (t) =>
    t.field({
        type: 'NemuResponse',
        args: {
            artist_code: t.arg({
                type: 'String',
                required: true,
                description: 'The code to check'
            })
        },
        resolve: async (_parent, args, _ctx, _info) => {
            const result = await prisma.aritstCode.findFirst({
                where: {
                    code: args.artist_code
                }
            })

            if (!result) {
                return {
                    status: StatusCode.InternalError,
                    message: 'Artist code not found!'
                }
            }

            return { status: StatusCode.Success }
        }
    })
)

/**
 * Creates a new artist code
 */
builder.queryField('generate_artist_code', (t) =>
    t.field({
        type: 'ArtistCodeResponse',
        resolve: async (_parent, _args, _ctx, _info) => {
            const new_code = 'NEMU-' + crypto.randomUUID()

            const result = await prisma.aritstCode.create({
                data: {
                    code: new_code
                }
            })

            if (!result) {
                return {
                    status: StatusCode.InternalError,
                    message: 'Failed to create Artist Code'
                }
            }

            return {
                status: StatusCode.Success,
                generated_code: new_code
            }
        }
    })
)
