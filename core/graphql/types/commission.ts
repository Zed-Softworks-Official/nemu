import { prisma } from '@/lib/prisma'
import { builder } from '../builder'
import { StatusCode } from '@/core/responses'
import { S3GetSignedURL } from '@/core/storage'
import { AWSLocations } from '@/core/structures'
import { AWSFileModification, AWSMoficiation } from '@/core/data-structures/form-structures'

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
        useInvoicing: t.exposeBoolean('useInvoicing'),

        rushOrdersAllowed: t.exposeBoolean('rushOrdersAllowed'),
        rushCharge: t.exposeFloat('rushCharge'),
        rushPercentage: t.exposeBoolean('rushPercentage'),

        maxCommissionsUntilWaitlist: t.exposeInt('maxCommissionsUntilWaitlist'),
        maxCommissionsUntilClosed: t.exposeInt('maxCommissionsUntilClosed'),

        form: t.relation('Form'),

        get_images: t.field({
            type: 'CommissionImagesResponse',
            resolve: async (parent, _args, _ctx, _info) => {
                const result: AWSFileModification[] = []

                // Get Featured Image
                const featured_image = await S3GetSignedURL(parent.artistId, AWSLocations.Commission, parent.featuredImage)
                result.push({
                    file_key: parent.featuredImage,
                    signed_url: featured_image,
                    aws_location: AWSLocations.Commission,
                    file_name: 'Featured Image',
                    featured: true
                })

                // Get additional images
                for (let i = 0; i < parent.additionalImages.length; i++) {
                    const signed_url = await S3GetSignedURL(parent.artistId, AWSLocations.Commission, parent.additionalImages[i])

                    result.push({
                        file_key: parent.additionalImages[i],
                        signed_url: signed_url,
                        aws_location: AWSLocations.Commission,
                        file_name: `Image ${i + 1}`,
                        featured: false
                    })
                }

                return {
                    status: StatusCode.Success,
                    images: result
                }
            }
        }),

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

                const submitted = form.formSubmissions.find((submission) => submission.userId === args.user_id!)

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
            rush_charge: t.arg({
                type: 'Float',
                required: true,
                description: ''
            }),
            rush_percentage: t.arg({
                type: 'Boolean',
                required: true,
                description: ''
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

            const slugExists = await prisma.commission.count({
                where: {
                    slug: slug,
                    artistId: artist.id
                }
            })

            if (slugExists != 0) {
                return {
                    status: StatusCode.InternalError,
                    message: 'A commission with that slug already exists for that artist!'
                }
            }

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
                    maxCommissionsUntilWaitlist: args.max_commission_until_waitlist <= 0 ? undefined : args.max_commission_until_waitlist,
                    maxCommissionsUntilClosed: args.max_commission_until_closed <= 0 ? undefined : args.max_commission_until_closed,
                    rushCharge: args.rush_charge,
                    rushPercentage: args.rush_percentage
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

            title: t.arg({
                type: 'String',
                required: false,
                description: ''
            }),
            description: t.arg({
                type: 'String',
                required: false,
                description: ''
            }),
            price: t.arg({
                type: 'Int',
                required: false,
                description: ''
            }),
            availability: t.arg({
                type: 'Int',
                required: false,
                description: ''
            }),

            published: t.arg({
                type: 'Boolean',
                required: false,
                description: ''
            }),
            use_invoicing: t.arg({
                type: 'Boolean',
                required: false,
                description: ''
            }),

            max_commissions_until_waitlist: t.arg({
                type: 'Int',
                required: false,
                description: ''
            }),
            max_commissions_until_closed: t.arg({
                type: 'Int',
                required: false,
                description: ''
            }),

            rush_orders_allowed: t.arg({
                type: 'Boolean',
                required: false,
                description: 'Determines wether rush orders are allowed or not'
            }),
            rush_charge: t.arg({
                type: 'Float',
                required: false,
                description: ''
            }),
            rush_percentage: t.arg({
                type: 'Boolean',
                required: false,
                description: ''
            }),

            additional_images: t.arg({
                type: 'String',
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
                        title: args.title ? args.title : undefined,
                        description: args.description ? args.description : undefined,
                        price: args.price ? args.price : undefined,
                        availability: args.availability ? args.availability : undefined,

                        published: args.published != undefined ? args.published : undefined,
                        useInvoicing: args.use_invoicing != undefined ? args.use_invoicing : undefined,

                        maxCommissionsUntilWaitlist: args.max_commissions_until_waitlist ? args.max_commissions_until_waitlist : undefined,
                        maxCommissionsUntilClosed: args.max_commissions_until_closed ? args.max_commissions_until_closed : undefined,

                        rushOrdersAllowed: args.rush_orders_allowed != undefined ? args.rush_orders_allowed : undefined,
                        rushCharge: args.rush_charge ? args.rush_charge : undefined,
                        rushPercentage: args.rush_percentage != undefined ? args.rush_percentage : undefined,
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
