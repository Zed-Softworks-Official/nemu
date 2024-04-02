import { z } from 'zod'
import { artistProcedure, createTRPCRouter, publicProcedure } from '../trpc'
import { redis } from '@/lib/redis'
import { prisma } from '@/lib/prisma'
import {
    AWSFileModification,
    AWSLocations,
    CommissionItem,
    CommissionStatus,
    ImageData,
    KanbanContainerData,
    KanbanTask,
    PaymentStatus
} from '@/core/structures'
import { S3GetSignedURL } from '@/core/storage'
import {
    CheckCreateSendbirdUser,
    CreateSendbirdMessageChannel,
    GetBlurData
} from '@/core/server-helpers'
import { AsRedisKey } from '@/core/helpers'
import { Commission, Form, FormSubmission, User } from '@prisma/client'
import { novu } from '@/lib/novu'
import { StripeCreateCommissionInvoice } from '@/core/stripe/commissions'
import { TRPCError } from '@trpc/server'
import { StripeCreateCustomer } from '@/core/payments'

type FormSubmissionResponse = FormSubmission & { user: User }

export const commissionsRouter = createTRPCRouter({
    /**
     * Gets ALL commissions from a given artist
     */
    get_commissions: publicProcedure
        .input(
            z.object({
                artist_id: z.string()
            })
        )
        .query(async (opts) => {
            // Get Artist Data
            const { input } = opts

            const cachedCommissions = await redis.get(
                AsRedisKey('commissions', input.artist_id)
            )

            if (cachedCommissions) {
                return JSON.parse(cachedCommissions) as CommissionItem[]
            }

            const commissions = await prisma.commission.findMany({
                where: {
                    artistId: input.artist_id
                },
                include: {
                    artist: true
                }
            })

            if (!commissions) {
                return undefined
            }

            // TODO: Move the creating commission item stuff
            // into a function so that i can just update
            // the redis cache instead of just deleting it

            // Get Commission Data
            const result: CommissionItem[] = []
            for (let i = 0; i < commissions.length; i++) {
                // Get Featured Image from S3
                const featured_signed_url = await S3GetSignedURL(
                    input.artist_id,
                    AWSLocations.Commission,
                    commissions[i].featuredImage
                )

                // Get the rest of the images
                const images: ImageData[] = []
                for (let j = 0; j < commissions[i].additionalImages.length; j++) {
                    const signed_url = await S3GetSignedURL(
                        input.artist_id,
                        AWSLocations.Commission,
                        commissions[i].additionalImages[j]
                    )

                    images.push({
                        signed_url: signed_url,
                        blur_data: (await GetBlurData(signed_url)).base64
                    })
                }

                result.push({
                    title: commissions[i].title,
                    description: commissions[i].description,
                    price: commissions[i].price || -1,
                    images: images,
                    featured_image: {
                        signed_url: featured_signed_url,
                        blur_data: (await GetBlurData(featured_signed_url)).base64
                    },
                    availability: commissions[i].availability,
                    slug: commissions[i].slug,
                    form_id: commissions[i].formId || undefined,
                    handle: commissions[i].artist.handle,
                    commission_id: commissions[i].id,
                    published: commissions[i].published
                })
            }

            await redis.set(
                AsRedisKey('commissions', input.artist_id),
                JSON.stringify(result),
                'EX',
                3600
            )

            return result
        }),

    /**
     * Gets a SINGLE commission given the id OR artist_id & slug
     */
    get_commission: publicProcedure
        .input(
            z.object({
                id: z.string().optional(),
                artist_id: z.string().optional(),
                slug: z.string().optional()
            })
        )
        .query(async (opts) => {
            const { input } = opts

            const cachedCommission = await redis.get(
                AsRedisKey('commissions', input.artist_id!, input.slug!)
            )

            if (cachedCommission) {
                return JSON.parse(cachedCommission) as Commission
            }

            const commission = await prisma.commission.findFirst({
                where: {
                    id: input.id || undefined,
                    artistId: input.artist_id! || undefined,
                    slug: input.slug || undefined
                }
            })

            await redis.set(
                AsRedisKey('commissions', input.artist_id!, input.slug!),
                JSON.stringify(commission),
                'EX',
                3600
            )

            return commission
        }),

    /**
     * Gets a SINGLE commission with all of the form data, submissions,
     * and pretty much everything you could ever need the artist to
     * accept and decline whatever requests they have
     */
    get_commission_data: artistProcedure
        .input(
            z.object({
                artist_id: z.string(),
                slug: z.string()
            })
        )
        .query(async (opts) => {
            const { input } = opts

            const cachedCommissionData = await redis.get(
                AsRedisKey('commissions_data', input.artist_id, input.slug)
            )

            if (cachedCommissionData) {
                return JSON.parse(cachedCommissionData) as Commission & {
                    form: Form & { formSubmissions: FormSubmissionResponse[] }
                } & {
                    containers: KanbanContainerData[]
                    tasks: KanbanTask[]
                }
            }

            // Get commmission data
            const commission = await prisma.commission.findFirst({
                where: {
                    artistId: input.artist_id,
                    slug: input.slug
                },
                include: {
                    form: {
                        include: {
                            formSubmissions: {
                                include: {
                                    user: true
                                }
                            }
                        }
                    }
                }
            })

            // Create the kanban stuff
            const containers: KanbanContainerData[] = [
                {
                    id: crypto.randomUUID(),
                    title: 'New Requests'
                },
                {
                    id: crypto.randomUUID(),
                    title: 'Active Requests'
                },
                {
                    id: crypto.randomUUID(),
                    title: 'Waitlisted Requests'
                }
            ]

            const tasks: KanbanTask[] = []
            for (const submission of commission?.form?.formSubmissions!) {
                const container_id =
                    submission.waitlist &&
                    submission.commissionStatus == CommissionStatus.WaitingApproval
                        ? containers[2].id
                        : containers[submission.commissionStatus].id

                tasks.push({
                    id: submission.id,
                    container_id: container_id,
                    content: submission.user.name!
                })
            }

            const result = {
                ...commission,
                containers,
                tasks
            }

            await redis.set(
                AsRedisKey('commissions_data', input.artist_id, input.slug),
                JSON.stringify(result),
                'EX',
                3600
            )

            return result
        }),

    /**
     * Gets a SINGLE commission with all of the editable values
     * Uses the artist id and the slug to fetch that item
     */
    get_commission_editable: artistProcedure
        .input(
            z.object({
                artist_id: z.string(),
                slug: z.string().optional()
            })
        )
        .query(async (opts) => {
            const { input, ctx } = opts

            if (!input.slug) {
                return undefined
            }

            // if (input.artist_id != ctx.session.user.handle)
            const cachedCommissionEditable = await redis.get(
                AsRedisKey('commissions_editable', input.artist_id, input.slug)
            )

            if (cachedCommissionEditable) {
                return JSON.parse(cachedCommissionEditable) as {
                    commission: Commission
                    images: AWSFileModification[]
                }
            }

            const commission = await prisma.commission.findFirst({
                where: {
                    artistId: input.artist_id,
                    slug: input.slug
                }
            })

            if (!commission) {
                return undefined
            }

            const images: AWSFileModification[] = []

            // Get Featured Image
            const featured_image = await S3GetSignedURL(
                input.artist_id,
                AWSLocations.Commission,
                commission.featuredImage
            )

            images.push({
                file_key: commission.featuredImage,
                signed_url: featured_image,
                aws_location: AWSLocations.Commission,
                file_name: 'Featured Image',
                featured: true
            })

            // Get additional images
            for (let i = 0; i < commission.additionalImages.length; i++) {
                const signed_url = await S3GetSignedURL(
                    input.artist_id,
                    AWSLocations.Commission,
                    commission.additionalImages[i]
                )

                images.push({
                    file_key: commission.additionalImages[i],
                    signed_url: signed_url,
                    aws_location: AWSLocations.Commission,
                    file_name: `Image ${i + 1}`,
                    featured: false
                })
            }

            const result = {
                commission,
                images
            }

            await redis.set(
                AsRedisKey('commissions_editable', input.artist_id, input.slug),
                JSON.stringify(result),
                'EX',
                3600
            )

            return result
        }),

    /**
     * Creates a new commission for the given artist
     */
    set_commission: artistProcedure
        .input(
            z.object({
                artist_id: z.string(),
                commission_data: z.object({
                    title: z.string(),
                    description: z.string(),
                    availability: z.number(),
                    featured_image: z.string(),
                    additional_images: z.array(z.string()),
                    rush_orders_allowed: z.boolean(),
                    rush_charge: z.number(),
                    rush_percentage: z.boolean(),
                    form_id: z.string(),
                    price: z.number(),
                    max_commissions_until_closed: z.number(),
                    max_commissions_until_waitlist: z.number(),
                    published: z.boolean().default(false)
                })
            })
        )
        .mutation(async (opts) => {
            const { input } = opts

            const artist = await prisma.artist.findFirst({
                where: {
                    id: input.artist_id
                }
            })

            if (!artist) {
                return { success: false }
            }

            // Create Slug
            const slug = input.commission_data
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
                return { success: false }
            }

            // Create database object
            const commision = await prisma.commission.create({
                data: {
                    artistId: input.artist_id,
                    price: input.commission_data.price,
                    formId: input.commission_data.form_id!,
                    title: input.commission_data.title!,
                    description: input.commission_data.description!,
                    featuredImage: input.commission_data.featured_image!,
                    additionalImages: input.commission_data.additional_images!,
                    rushOrdersAllowed: input.commission_data.rush_orders_allowed!,
                    availability: input.commission_data.availability!,
                    slug: slug,
                    maxCommissionsUntilWaitlist:
                        input.commission_data.max_commissions_until_waitlist! <= 0
                            ? undefined
                            : input.commission_data.max_commissions_until_waitlist!,
                    maxCommissionsUntilClosed:
                        input.commission_data.max_commissions_until_closed! <= 0
                            ? undefined
                            : input.commission_data.max_commissions_until_closed!,
                    rushCharge: input.commission_data.rush_charge!,
                    rushPercentage: input.commission_data.rush_percentage!
                }
            })

            // Update the form to also include the commission
            await prisma.form.update({
                where: {
                    id: input.commission_data.form_id!
                },
                data: {
                    commissionId: commision.id
                }
            })

            // Check if creating the object in the database was successful
            if (!commision) {
                return { success: false }
            }

            // Delete Cache
            await redis.del(AsRedisKey('commissions', commision.artistId))

            return { success: true }
        }),

    /**
     * Updates a given commission given the id of the commission
     */
    update_commission: artistProcedure
        .input(
            z.object({
                commission_id: z.string(),
                commission_data: z.object({
                    title: z.string().optional(),
                    description: z.string().optional(),
                    availability: z.number().optional(),
                    featured_image: z.string().optional(),
                    additional_images: z.array(z.string()).optional(),
                    rush_orders_allowed: z.boolean().optional(),
                    rush_charge: z.number().optional(),
                    rush_percentage: z.boolean().optional(),
                    form_id: z.string().optional(),
                    price: z.number().optional(),
                    max_commissions_until_closed: z.number().optional(),
                    max_commissions_until_waitlist: z.number().optional(),
                    published: z.boolean().optional()
                })
            })
        )
        .mutation(async (opts) => {
            const { input } = opts

            const updated_commission = await prisma.commission.update({
                where: {
                    id: input.commission_id
                },
                data: {
                    title: input.commission_data.title
                        ? input.commission_data.title
                        : undefined,
                    description: input.commission_data.description
                        ? input.commission_data.description
                        : undefined,
                    price: input.commission_data.price
                        ? input.commission_data.price
                        : undefined,
                    availability: input.commission_data.availability
                        ? input.commission_data.availability
                        : undefined,

                    published:
                        input.commission_data.published != undefined
                            ? input.commission_data.published
                            : undefined,

                    maxCommissionsUntilWaitlist: input.commission_data
                        .max_commissions_until_waitlist
                        ? input.commission_data.max_commissions_until_waitlist
                        : undefined,
                    maxCommissionsUntilClosed: input.commission_data
                        .max_commissions_until_closed
                        ? input.commission_data.max_commissions_until_closed
                        : undefined,

                    rushOrdersAllowed:
                        input.commission_data.rush_orders_allowed != undefined
                            ? input.commission_data.rush_orders_allowed
                            : undefined,
                    rushCharge: input.commission_data.rush_charge
                        ? input.commission_data.rush_charge
                        : undefined,
                    rushPercentage:
                        input.commission_data.rush_percentage != undefined
                            ? input.commission_data.rush_percentage
                            : undefined
                }
            })

            if (!updated_commission) {
                return { success: false }
            }

            // Delete Cache
            await redis.del(AsRedisKey('commissions', updated_commission.artistId))

            return { success: true }
        }),

    /**
     * Determines wether to accept or reject the commission
     */
    accept_reject_commission: artistProcedure
        .input(
            z.object({
                accepted: z.boolean(),
                create_data: z.object({
                    form_submission_id: z.string()
                })
            })
        )
        .mutation(async (opts) => {
            const { input } = opts

            // Get the form submission
            const submission = await prisma.formSubmission.findFirst({
                where: {
                    id: input.create_data.form_submission_id
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
                    },
                    user: true
                }
            })

            if (!submission) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Failed to find submission'
                })
            }

            // Get Stripe customer_id
            let customer_id = await prisma.stripeCustomerIds.findFirst({
                where: {
                    artistId: submission.form.artistId,
                    userId: submission.userId
                }
            })

            if (!customer_id) {
                // Create new stripe customer for user
                const stripe_customer = await StripeCreateCustomer(
                    submission.form.commission?.artist.stripeAccount!,
                    submission.user.name!,
                    submission.user.email || undefined
                )

                // Update user with stripe account id
                customer_id = await prisma.stripeCustomerIds.create({
                    data: {
                        customerId: stripe_customer.id,
                        stripeAccount: submission.form.commission?.artist.stripeAccount!,
                        artistId: submission.form.commission?.artistId!,
                        userId: submission.userId
                    }
                })

                if (!customer_id) {
                    throw new TRPCError({
                        code: 'INTERNAL_SERVER_ERROR',
                        message: 'Could not create stripe account for user!'
                    })
                }
            }

            // Update form based on rejection or submission
            const updated_form = await prisma.form.update({
                where: {
                    id: submission?.form.id
                },
                data: {
                    newSubmissions: {
                        decrement: 1
                    },
                    acceptedSubmissions: {
                        increment: input.accepted ? 1 : 0
                    },
                    rejectedSubmissions: {
                        increment: !input.accepted ? 1 : 0
                    }
                }
            })

            if (!updated_form) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Failed to update form'
                })
            }

            ///////////////////////////////////////////////////
            // Notify User
            ///////////////////////////////////////////////////
            novu.trigger('commission-accepted-rejected', {
                to: {
                    subscriberId: submission.userId
                },
                payload: {
                    commission_name: submission?.form.commission?.title,
                    artist_handle: submission?.form.commission?.artist.handle,
                    status: input.accepted ? 'accepted' : 'rejected'
                }
            })

            ///////////////////////////////////////////////////
            // Handle Commission Rejection
            ///////////////////////////////////////////////////
            if (!input.accepted) {
                await prisma.formSubmission.update({
                    where: {
                        id: input.create_data.form_submission_id
                    },
                    data: {
                        commissionStatus: CommissionStatus.Rejected
                    }
                })

                return { success: true }
            }

            ///////////////////////////////////////////////////
            // Handle Commission Acceptance
            ///////////////////////////////////////////////////

            // Create Stripe Draft
            const stripe_draft = await StripeCreateCommissionInvoice(
                customer_id.customerId,
                customer_id.stripeAccount,
                customer_id.userId,
                submission?.orderId!,
                submission?.form.commissionId!
            )

            // Create the invoice with the initial item
            const invoice = await prisma.invoice.create({
                data: {
                    stripeId: stripe_draft.id,
                    customerId: customer_id.customerId,
                    stripeAccount: customer_id.stripeAccount,
                    userId: customer_id.userId,
                    artistId: customer_id.artistId,
                    paymentStatus: PaymentStatus.InvoiceCreated,
                    submissionId: submission?.id,
                    items: {
                        create: {
                            name: submission.form.commission?.title!,
                            price: submission.form.commission?.price!,
                            quantity: 1
                        }
                    }
                }
            })

            if (!invoice) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Failed to create invoice'
                })
            }

            // Create a sendbird user if they don't have one
            await CheckCreateSendbirdUser(customer_id.userId)

            // Create Channel for sendbird
            const sendbird_channel_url = crypto.randomUUID()
            await CreateSendbirdMessageChannel(
                input.create_data.form_submission_id,
                sendbird_channel_url
            )

            // Create Default containers for the kanban
            const defaultContainers: KanbanContainerData[] = [
                {
                    id: crypto.randomUUID(),
                    title: 'Todo'
                },
                {
                    id: crypto.randomUUID(),
                    title: 'In Progress'
                },
                {
                    id: crypto.randomUUID(),
                    title: 'Done'
                }
            ]

            // Create Kanban for the user
            const kanban = await prisma.kanban.create({
                data: {
                    formSubmissionId: submission?.id!,
                    containers: JSON.stringify(defaultContainers)
                }
            })

            // Update the form submission to keep track of the item
            const updated_submission = await prisma.formSubmission.update({
                where: {
                    id: input.create_data.form_submission_id!
                },
                data: {
                    invoiceId: invoice.id,
                    commissionStatus: CommissionStatus.Accepted,
                    sendbirdChannelURL: sendbird_channel_url,
                    kanbanId: kanban.id
                }
            })

            if (!updated_submission) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Failed to update form submission!'
                })
            }

            return { success: true }
        })
})