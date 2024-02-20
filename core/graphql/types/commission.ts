import { prisma } from '@/lib/prisma'
import { builder } from '../builder'
import { StatusCode } from '@/core/responses'

builder.prismaObject('Commission', {
    fields: (t) => ({
        id: t.exposeString('id'),
        artistId: t.exposeString('artistId'),
        price: t.exposeInt('price', { nullable: true }),
        formId: t.exposeString('formId'),

        title: t.exposeString('title'),
        description: t.exposeString('description'),
        featuredImage: t.exposeString('featuredImage'),
        additionalImages: t.exposeStringList('additionalImages'),
        availability: t.exposeInt('availability'),
        slug: t.exposeString('slug'),

        published: t.exposeBoolean('published'),
        createdAt: t.expose('createdAt', { type: 'Date' }),
        rushOrdersAllowed: t.exposeBoolean('rushOrdersAllowed'),
        useInvoicing: t.exposeBoolean('useInvoicing'),

        maxCommissionsUntilWaitlist: t.exposeInt('maxCommissionsUntilWaitlist', {
            nullable: true
        }),
        maxCommissionsUntilClosed: t.exposeInt('maxCommissionUntilClosed', {
            nullable: true
        }),

        form: t.relation('Form'),

        get_form_data: t.prismaField({
            type: 'Form',
            resolve: (query, commission, _args, _ctx, _info) =>
                prisma.form.findFirstOrThrow({
                    ...query,
                    where: {
                        id: commission.formId,
                        artistId: commission.artistId
                    },
                    include: {
                        formSubmissions: true
                    }
                })
        }),

        get_form_content: t.field({
            type: 'CommissionFormData',
            args: {
                user_id: t.arg({
                    type: 'String',
                    required: false,
                    description: 'Check if the user has a form submission'
                })
            },
            resolve: async (commission, args, _ctx, _info) => {
                const form = await prisma.form.findFirst({
                    where: {
                        id: commission.formId,
                        artistId: commission.artistId
                    },
                    include: {
                        formSubmissions: true
                    }
                })

                if (!form) {
                    return {
                        user_submitted: false,
                        content: ''
                    }
                }

                const submitted = form.formSubmissions.find(
                    (submission) => submission.userId === args.user_id!
                )

                return {
                    user_submitted: submitted != undefined,
                    content: form.content
                }
            }
        }),

        artist: t.relation('artist')
    })
})

builder.queryField('commission', (t) =>
    t.prismaField({
        type: 'Commission',
        args: {
            id: t.arg({
                type: 'String',
                required: false,
                description: 'Id of the commission'
            }),
            artist_id: t.arg({
                type: 'String',
                required: false,
                description: 'artist id of the commission'
            }),
            slug: t.arg({
                type: 'String',
                required: false,
                description: 'slug of the commission to get'
            })
        },
        resolve: (query, _parent, args, _ctx, _info) =>
            prisma.commission.findFirstOrThrow({
                ...query,
                where: {
                    id: args.id || undefined,
                    artistId: args.artist_id! || undefined,
                    slug: args.slug || undefined
                }
            })
    })
)

// TODO: Check if the commission slug already exists for the current user
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
            form_id: t.arg({
                type: 'String',
                required: true,
                description: 'The id of the form'
            }),
            price: t.arg({
                type: 'Float',
                required: false,
                description: 'The price of the commission'
            }),
            use_invoicing: t.arg({
                type: 'Boolean',
                required: false,
                description: 'Wether to create invoices or use a fixed price'
            }),
            max_commission_until_waitlist: t.arg({
                type: 'Int',
                required: true
            }),
            max_commission_until_closed: t.arg({
                type: 'Int',
                required: true
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

            // Create Slug
            const slug = args.title
                .toLowerCase()
                .replace(/[^a-zA-Z ]/g, '')
                .replaceAll(' ', '-')

            // Create database object
            const db_commission = await prisma.commission.create({
                data: {
                    artistId: args.artist_id,
                    price: args.price,
                    formId: args.form_id,
                    title: args.title,
                    description: args.description,
                    featuredImage: args.featured_image,
                    additionalImages: args.additional_images,
                    rushOrdersAllowed: args.rush_orders_allowed,
                    availability: args.availability,
                    useInvoicing: args.use_invoicing || undefined,
                    slug: slug,
                    maxCommissionsUntilWaitlist:
                        args.max_commission_until_waitlist <= 0
                            ? undefined
                            : args.max_commission_until_waitlist,
                    maxCommissionUntilClosed:
                        args.max_commission_until_closed <= 0
                            ? undefined
                            : args.max_commission_until_closed
                }
            })

            // Update the form to also include the commission
            await prisma.form.update({
                where: {
                    id: args.form_id
                },
                data: {
                    commissionId: db_commission.id
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

builder.mutationField('update_commission', (t) =>
    t.field({
        type: 'NemuResponse',
        args: {
            commission_id: t.arg({
                type: 'String',
                required: true,
                description: ''
            }),

            published: t.arg({
                type: 'Boolean',
                required: false,
                description: ''
            })
        },
        resolve: async (_parent, args, _ctx, _info) => {
            try {
                await prisma.commission.update({
                    where: {
                        id: args.commission_id
                    },
                    data: {
                        published:
                            args.published == undefined ? undefined : args.published
                    }
                })
            } catch (e) {
                return {
                    status: StatusCode.InternalError,
                    message: 'An error has occured updating your commission'
                }
            }

            return {
                status: StatusCode.Success
            }
        }
    })
)
