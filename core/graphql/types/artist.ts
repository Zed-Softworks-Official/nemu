import { prisma } from '@/lib/prisma'
import { builder } from '../builder'
import { S3GetSignedURL } from '@/core/storage'
import { AWSLocations } from '@/core/structures'

builder
    .objectRef<{
        signed_url: string
        name: string
    }>('PortfolioResponse')
    .implement({
        fields: (t) => ({
            signed_url: t.exposeString('signed_url'),
            name: t.exposeString('name')
        })
    })

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
        portfolioItems: t.field({
            type: ['PortfolioResponse'],
            resolve: async (artist) => {
                const result: { signed_url: string; name: string }[] = []
                const portfolio = await prisma.portfolio.findMany({
                    where: {
                        artistId: artist.id
                    }
                })

                for (let i = 0; i < portfolio.length; i++) {
                    const signed_url = await S3GetSignedURL(
                        artist.handle,
                        AWSLocations.Portfolio,
                        portfolio[i].image
                    )

                    if (!signed_url) {
                        return result
                    }

                    result.push({
                        signed_url: signed_url,
                        name: portfolio[i].name
                    })
                }

                return result
            }
        }),

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
