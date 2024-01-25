import { prisma } from '@/lib/prisma'
import { builder } from '../builder'

builder.prismaObject('Portfolio', {
    fields: (t) => ({
        id: t.exposeString('id'),
        artistId: t.exposeString('artistId'),
        image: t.exposeString('image'),
        name: t.exposeString('name'),
        artist: t.relation('artist')
    })
})

builder.queryField('portfolio_item', (t) =>
    t.prismaField({
        type: 'Portfolio',
        args: {
            artist_id: t.arg({
                type: 'String',
                required: true,
                description: 'The artists handle for the image'
            }),
            item_id: t.arg({
                type: 'String',
                required: true,
                description: 'The specific item id you are requesting'
            })
        },
        resolve: (query, _parent, args, _ctx, _info) =>
            prisma.portfolio.findFirstOrThrow({
                ...query,
                where: {
                    artistId: args.artist_id,
                    id: args.item_id
                }
            })
    })
)
