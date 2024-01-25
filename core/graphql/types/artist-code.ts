import { prisma } from '@/lib/prisma'
import { builder } from '../builder'

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
