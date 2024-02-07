import { prisma } from '@/lib/prisma'
import { builder } from '../builder'
import { S3GetSignedURL } from '@/core/storage'
import { AWSLocations, CommissionItem, PortfolioItem } from '@/core/structures'
import { StripeGetCommissionProduct } from '@/core/stripe/commissions'

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

        commissions: t.field({
            type: ['CommissionData'],
            resolve: async (artist) => {
                const result: CommissionItem[] = []
                const commissions = await prisma.commission.findMany({
                    where: {
                        artistId: artist.id
                    }
                })

                for (let i = 0; i < commissions.length; i++) {
                    // Get Featured Image from S3
                    const featured_signed_url = await S3GetSignedURL(
                        artist.id,
                        AWSLocations.Commission,
                        commissions[i].featuredImage
                    )

                    if (!featured_signed_url) {
                        return result
                    }

                    // Get product information from stripe
                    let price = -1
                    if (!commissions[i].useInvoicing) {
                        price = (
                            await StripeGetCommissionProduct(
                                commissions[i].productId!,
                                artist.stripeAccId
                            )
                        ).price
                    }

                    result.push({
                        title: commissions[i].title,
                        description: commissions[i].description,
                        price: price,
                        featured_image: featured_signed_url,
                        availability: commissions[i].availability,
                        slug: commissions[i].slug,
                        form_id: commissions[i].formId || undefined,
                        handle: artist.handle
                    })
                }

                return result
            }
        }),
        store_items: t.relation('storeItems'),
        portfolio_items: t.field({
            type: ['PortfolioData'],
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

        get_form: t.field({
            type: 'CommissionFormData',
            args: {
                form_id: t.arg({
                    type: 'String',
                    required: true,
                    description: 'The form id for the commission response'
                })
            },
            resolve: async (artist, args) => {
                const form = await prisma.form.findFirst({
                    where: {
                        artistId: artist.id,
                        id: args.form_id
                    }
                })

                if (!form) {
                    return {
                        form_id: '',
                        content: ''
                    }
                }

                return {
                    form_id: form.id,
                    content: form.content
                }
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
