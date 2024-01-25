import { prisma } from '@/lib/prisma'
import { builder } from '../builder'

builder.prismaObject('Purchased', {
    fields: (t) => ({
        id: t.exposeString('id'),
        userId: t.exposeString('userId'),
        customerId: t.exposeString('customerId'),
        productId: t.exposeString('productId'),
        stripeAccount: t.exposeString('stripeAccId'),
        complete: t.exposeBoolean('complete'),

        user: t.relation('user')
    })
})

builder.queryField('purchases', (t) =>
    t.prismaField({
        type: ['Purchased'],
        args: {
            userId: t.arg({
                type: 'String',
                required: true,
                description: 'The user id to get the purchases for'
            })
        },
        resolve: (query, _parent, args, _ctx, _info) =>
            prisma.purchased.findMany({
                ...query,
                where: {
                    userId: args.userId
                }
            })
    })
)
