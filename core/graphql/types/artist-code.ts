import { prisma } from '@/lib/prisma'
import { builder } from '../builder'
import { StatusCode } from '@/core/responses'

builder.prismaObject('AritstCode', {
    fields: (t) => ({
        id: t.exposeString('id'),
        code: t.exposeString('code')
    })
})

builder.queryField('artist_codes', (t) =>
    t.prismaField({
        type: ['AritstCode'],
        resolve: (query, _parent, _args, _ctx, _info) =>
            prisma.aritstCode.findMany({ ...query })
    })
)

builder.mutationField('create_artist_code', (t) =>
    t.field({
        type: 'NemuResponse',
        resolve: async (_parent, _args, _ctx, _info) => {
            const new_code = crypto.randomUUID()

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
                message: new_code
            }
        }
    })
)
