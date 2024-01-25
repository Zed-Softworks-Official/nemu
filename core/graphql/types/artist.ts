import { prisma } from '@/lib/prisma'
import { builder } from '../builder'

builder.prismaObject('Artist', {
    fields: (t) => ({
        id: t.exposeString('id'),
        userId: t.exposeString('userId'),
        stripeAccount: t.exposeString('stripeAccId'),

        handle: t.exposeString('handle'),
        about: t.exposeString('about'),
        location: t.exposeString('location'),
        terms: t.exposeString('terms'),

        headerPhoto: t.exposeString('headerPhoto'),
        profilePhoto: t.exposeString('profilePhoto'),

        user: t.relation('user'),

        commissions: t.relation('commissions'),
        storeItems: t.relation('storeItems'),
        portfolioItems: t.relation('portfolioItems'),
        forms: t.relation('forms'),
        socials: t.relation('socials')
    })
})

builder.queryField('artists', (t) =>
    t.prismaField({
        type: ['Artist'],
        resolve: (query, _parent, _args, _ctx, _info) =>
            prisma.artist.findMany({ ...query })
    })
)

builder.queryField('artist', (t) =>
    t.prismaField({
        type: 'Artist',
        args: {
            id: t.arg({
                type: 'String',
                required: true,
                description: 'Id of the artist'
            })
        },
        resolve: (query, _parent, args, _ctx, _info) =>
            prisma.artist.findFirstOrThrow({
                ...query,
                where: {
                    id: args.id
                }
            })
    })
)
