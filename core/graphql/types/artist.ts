import { prisma } from '@/lib/prisma'
import { builder } from '../builder'
import { S3GetSignedURL } from '@/core/storage'
import { AWSLocations, PortfolioItem } from '@/core/structures'

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
        store_items: t.relation('storeItems'),
        portfolio_items: t.field({
            type: ['PortfolioResponse'],
            resolve: async (artist) => {
                const result: PortfolioItem[] = []
                const portfolio = await prisma.portfolio.findMany({
                    where: {
                        artistId: artist.id
                    }
                })

                for (let i = 0; i < portfolio.length; i++) {
                    const signed_url = await S3GetSignedURL(
                        artist.id,
                        AWSLocations.Portfolio,
                        portfolio[i].image
                    )

                    if (!signed_url) {
                        return result
                    }

                    result.push({
                        signed_url: signed_url,
                        image_key: portfolio[i].image,
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

/**
 * Gets a single artist
 */
builder.queryField('artist', (t) =>
    t.prismaField({
        type: 'Artist',
        args: {
            id: t.arg({
                type: 'String',
                required: false,
                description: 'Id of the artist'
            }),
            handle: t.arg({
                type: 'String',
                required: false,
                description: 'Handle of the artist'
            })
        },
        resolve: (query, _parent, args, _ctx, _info) =>
            prisma.artist.findFirstOrThrow({
                ...query,
                where: {
                    id: args.id || undefined,
                    handle: args.handle || undefined
                }
            })
    })
)
