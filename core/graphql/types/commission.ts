import { prisma } from '@/lib/prisma'
import { builder } from '../builder'
import { StatusCode } from '@/core/responses'
import { S3GetSignedURL } from '@/core/storage'
import { AWSLocations, PaymentStatus } from '@/core/structures'
import { AWSFileModification, CommissionStatus } from '@/core/data-structures/form-structures'
import { StripeCreateCommissionInvoice } from '@/core/stripe/commissions'
import { novu } from '@/lib/novu'
import { CheckCreateSendbirdUser, CreateSendbirdMessageChannel } from '@/core/server-helpers'

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
            commission_data: t.arg({
                type: 'CommissionInputType',
                required: true,
                description: 'Data for the commision'
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
            const slug = args.commission_data
                .title!.toLowerCase()
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
                    price: args.commission_data.price,
                    formId: args.commission_data.form_id!,
                    title: args.commission_data.title!,
                    description: args.commission_data.description!,
                    featuredImage: args.commission_data.featured_image!,
                    additionalImages: args.commission_data.additional_images!,
                    rushOrdersAllowed: args.commission_data.rush_orders_allowed!,
                    availability: args.commission_data.availability!,
                    slug: slug,
                    maxCommissionsUntilWaitlist:
                        args.commission_data.max_commission_until_waitlist! <= 0 ? undefined : args.commission_data.max_commission_until_waitlist!,
                    maxCommissionsUntilClosed:
                        args.commission_data.max_commission_until_closed! <= 0 ? undefined : args.commission_data.max_commission_until_closed!,
                    rushCharge: args.commission_data.rush_charge!,
                    rushPercentage: args.commission_data.rush_percentage!
                }
            })

            // Update the form to also include the commission
            await prisma.form.update({
                where: {
                    id: args.commission_data.form_id!
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
                description: 'The id of the commission to update'
            }),

            commission_data: t.arg({
                type: 'CommissionInputType',
                required: true,
                description: 'The data to update for the commission'
            })
        },
        resolve: async (_parent, args, _ctx, _info) => {
            try {
                await prisma.commission.update({
                    where: {
                        id: args.commission_id
                    },
                    data: {
                        title: args.commission_data.title ? args.commission_data.title : undefined,
                        description: args.commission_data.description ? args.commission_data.description : undefined,
                        price: args.commission_data.price ? args.commission_data.price : undefined,
                        availability: args.commission_data.availability ? args.commission_data.availability : undefined,

                        published: args.commission_data.published != undefined ? args.commission_data.published : undefined,

                        maxCommissionsUntilWaitlist: args.commission_data.max_commission_until_waitlist
                            ? args.commission_data.max_commission_until_waitlist
                            : undefined,
                        maxCommissionsUntilClosed: args.commission_data.max_commission_until_closed
                            ? args.commission_data.max_commission_until_closed
                            : undefined,

                        rushOrdersAllowed:
                            args.commission_data.rush_orders_allowed != undefined ? args.commission_data.rush_orders_allowed : undefined,
                        rushCharge: args.commission_data.rush_charge ? args.commission_data.rush_charge : undefined,
                        rushPercentage: args.commission_data.rush_percentage != undefined ? args.commission_data.rush_percentage : undefined
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

builder.mutationField('accept_reject_commission', (t) =>
    t.field({
        type: 'NemuResponse',
        args: {
            accepted: t.arg({
                type: 'Boolean',
                required: true
            }),
            create_data: t.arg({
                type: 'InvoiceCreateInputType',
                required: true
            })
        },
        resolve: async (_parent, args) => {
            // Get the form submission
            const submission = await prisma.formSubmission.findFirst({
                where: {
                    id: args.create_data.form_submission_id
                },
                include: {
                    form: {
                        include: {
                            commission: {
                                include: {
                                    artist: true
                                }
                            }
                        }
                    }
                }
            })

            // Update form based on rejection or submission
            await prisma.form.update({
                where: {
                    id: submission?.form.id
                },
                data: {
                    newSubmissions: {
                        decrement: 1
                    },
                    acceptedSubmissions: {
                        increment: args.accepted ? 1 : 0
                    },
                    rejectedSubmissions: {
                        increment: !args.accepted ? 1 : 0
                    }
                }
            })

            // notify user
            novu.trigger('commission-accepted-rejected', {
                to: {
                    subscriberId: args.create_data.user_id
                },
                payload: {
                    commission_name: submission?.form.commission?.title,
                    artist_handle: submission?.form.commission?.artist.handle,
                    status: args.accepted ? 'accepted' : 'rejected'
                }
            })

            ///////////////////////////////////////////////////
            // Handle Commission Rejection
            ///////////////////////////////////////////////////
            if (!args.accepted) {
                await prisma.formSubmission.update({
                    where: {
                        id: args.create_data.form_submission_id
                    },
                    data: {
                        paymentStatus: PaymentStatus.Cancelled,
                        commissionStatus: CommissionStatus.Rejected
                    }
                })

                return {
                    status: StatusCode.Success
                }
            }

            ///////////////////////////////////////////////////
            // Handle Commission Acceptance
            ///////////////////////////////////////////////////

            // Create Stripe Draft
            const stripe_draft = await StripeCreateCommissionInvoice(
                args.create_data.customer_id!,
                args.create_data.stripe_account!,
                args.create_data.user_id!,
                submission?.orderId!,
                submission?.form.commissionId!
            )

            // Create the invoice with the initial item
            const invoice = await prisma.invoice.create({
                data: {
                    stripeId: stripe_draft.id,
                    customerId: args.create_data.customer_id!,
                    stripeAccount: args.create_data.stripe_account!,
                    userId: args.create_data.user_id!,
                    artistId: args.create_data.artist_id!,
                    items: {
                        create: {
                            name: args.create_data.initial_item_name!,
                            price: args.create_data.initial_item_price!,
                            quantity: args.create_data.initial_item_quantity!
                        }
                    }
                }
            })

            // Create a sendbird user if they don't have one
            await CheckCreateSendbirdUser(args.create_data.user_id)

            // Create Channel for sendbird
            const sendbird_channel_url = crypto.randomUUID()
            await CreateSendbirdMessageChannel(args.create_data.form_submission_id, sendbird_channel_url)

            // Update the form submission to keep track of the item
            await prisma.formSubmission.update({
                where: {
                    id: args.create_data.form_submission_id!
                },
                data: {
                    invoiceId: invoice.id,
                    paymentStatus: PaymentStatus.InvoiceCreated,
                    commissionStatus: CommissionStatus.Accepted,
                    sendbirdChannelURL: sendbird_channel_url
                }
            })

            return {
                status: StatusCode.Success
            }
        }
    })
)
