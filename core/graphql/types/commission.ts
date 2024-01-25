import { prisma } from '@/lib/prisma'
import { builder } from '../builder'

builder.prismaObject('Commission', {
    fields: (t) => ({
        id: t.exposeString('id'),
        artistId: t.exposeString('artistId'),
        productId: t.exposeString('productId'),

        title: t.exposeString('title'),
        description: t.exposeString('description'),
        featuredImage: t.exposeString('featuredImage'),
        
        published: t.exposeBoolean('published'),
        createdAt: t.expose('createdAt', { type: 'Date' }),
        rushOrdersAllowed: t.exposeBoolean('rushOrdersAllowed'),

        artist: t.relation('artist')
    })
})

builder.queryField('commission', (t) =>
    t.prismaField({
        type: 'Commission',
        args: {
            id: t.arg({
                type: 'String',
                required: true,
                description: 'Id of the commission'
            })
        },
        resolve: (query, _parent, args, _ctx, _info) =>
            prisma.commission.findFirstOrThrow({
                ...query,
                where: {
                    id: args.id
                }
            })
    })
)
