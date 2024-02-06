import { prisma } from '@/lib/prisma'
import { builder } from '../builder'
import { StatusCode } from '@/core/responses'
import { StripeCreateCommissionProduct } from '@/core/stripe/commission'

builder.prismaObject('Commission', {
    fields: (t) => ({
        id: t.exposeString('id'),
        artistId: t.exposeString('artistId'),
        productId: t.exposeString('productId'),
        formId: t.exposeString('formId'),

        title: t.exposeString('title'),
        description: t.exposeString('description'),
        featuredImage: t.exposeString('featuredImage'),
        additionalImages: t.exposeStringList('additionalImages'),
        availability: t.exposeInt('availability'),

        published: t.exposeBoolean('published'),
        createdAt: t.expose('createdAt', { type: 'Date' }),
        rushOrdersAllowed: t.exposeBoolean('rushOrdersAllowed'),
        useInvoicing: t.exposeBoolean('useInvoicing'),

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

builder.mutationField('create_commission', (t) =>
    t.field({
        type: 'NemuResponse',
        args: {
            artist_id: t.arg({
                type: 'String',
                required: true,
                description: 'The id of the artist'
            }),
            title: t.arg({
                type: 'String',
                required: true,
                description: 'The title of the commission'
            }),
            
            description: t.arg({
                type: 'String',
                required: true,
                description: 'The description of the commission'
            }),
            availability: t.arg({
                type: 'Int',
                required: true,
                description: 'The availability of the commission'
            }),
            featured_image: t.arg({
                type: 'String',
                required: true,
                description: 'The featured image key'
            }),
            additional_images: t.arg({
                type: ['String'],
                required: true,
                description: 'An array of the additional images for the commission'
            }),
            rush_orders_allowed: t.arg({
                type: 'Boolean',
                required: true,
                description: 'Determines wether rush orders are allowed or not'
            }),
            price: t.arg({
                type: 'Float',
                required: false,
                description: 'The price of the commission'
            }),
            form_id: t.arg({
                type: 'String',
                required: false,
                description: 'The id of the form'
            }),
            use_invoicing: t.arg({
                type: 'Boolean',
                required: false,
                description: 'Wether to create invoices or use a fixed price'
            })
            
        },
        resolve: async (_parent, args, _ctx, _info) => {
            // Get the artist
            const artist = await prisma.artist.findFirst({
                where: {
                    id: args.artist_id
                }
            })

            if (!artist) {
                return {
                    status: StatusCode.InternalError,
                    message: 'Unable to find artist!'
                }
            }

            // Create Stripe Product if we aren't using invoices
            let stripe_commission_id = undefined
            if (!args.use_invoicing) {
                const stripe_commission = await StripeCreateCommissionProduct(
                    artist.stripeAccId,
                    {
                        title: args.title,
                        description: args.description,
                        price: args.price!
                    }
                )
    
                if (!stripe_commission) {
                    return {
                        status: StatusCode.InternalError,
                        message: 'Failed to create stripe product for commission'
                    }
                }

                stripe_commission_id = stripe_commission.id
            }

            // Create database object
            const db_commission = await prisma.commission.create({
                data: {
                    artistId: args.artist_id,
                    productId: stripe_commission_id,
                    formId: args.form_id || undefined,
                    title: args.title,
                    description: args.description,
                    featuredImage: args.featured_image,
                    additionalImages: args.additional_images,
                    rushOrdersAllowed: args.rush_orders_allowed,
                    availability: args.availability,
                    useInvoicing: args.use_invoicing || undefined
                }
            })

            // Check if creating the object in the database was successful
            if (!db_commission) {
                return {
                    status: StatusCode.InternalError,
                    message: 'Failed to create commission in database'
                }
            }

            return { status: StatusCode.Success }
        }
    })
)
