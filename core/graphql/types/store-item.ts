import { prisma } from '@/lib/prisma'
import { builder } from '../builder'

builder.prismaObject('StoreItem', {
    fields: (t) => ({
        id: t.exposeString('id'),
        artistId: t.exposeString('artistId'),
        productId: t.exposeString('product'),
        StripeAccount: t.exposeString('stripeAccId'),
        handle: t.exposeString('handle'),
        slug: t.exposeString('slug'),

        artist: t.relation('artist')
    })
})

builder.queryField('store_item', (t) =>
    t.prismaField({
        type: 'StoreItem',
        args: {
            productId: t.arg({
                type: 'String',
                required: true,
                description: 'The id of the product'
            }),
            stripeAccount: t.arg({
                type: 'String',
                required: true,
                description: 'The account id of the product requested'
            })
        },
        resolve: (query, _parent, args, _ctx, _info) =>
            prisma.storeItem.findFirstOrThrow({
                ...query,
                where: {
                    stripeAccId: args.stripeAccount,
                    product: args.productId
                }
            })
    })
)
