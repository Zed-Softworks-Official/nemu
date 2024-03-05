import { builder } from '../builder'
import {
    StripeAcceptCommissionPaymentIntent,
    StripeCreateCommissionInvoice,
    StripeFinalizeCommissionInvoice,
    StripeRejectCommissionPaymentIntent
} from '@/core/stripe/commissions'

import { prisma } from '@/lib/prisma'
import { StatusCode } from '@/core/responses'
import { PaymentStatus } from '@/core/structures'
import { StripeCreateCustomer } from '@/core/payments'
import Stripe from 'stripe'
import { CommissionStatus } from '@/core/data-structures/form-structures'
import { sendbird } from '@/lib/sendbird'
import { CheckCreateSendbirdUser, CreateSendbirdMessageChannel } from '@/core/helpers'

builder.mutationField('check_create_customer', (t) =>
    t.field({
        type: 'StripeCustomerIdResponse',
        args: {
            user_id: t.arg({
                type: 'String',
                required: true,
                description: ''
            }),
            artist_id: t.arg({
                type: 'String',
                required: true,
                description: ''
            })
        },
        resolve: async (_parent, args, _ctx, _info) => {
            // Check if a customer id exsits for a stripe account
            const customer_id = await prisma.stripeCustomerIds.findFirst({
                where: {
                    userId: args.user_id,
                    artistId: args.artist_id
                }
            })

            // If it exists then return that we have one
            if (customer_id) {
                return {
                    status: StatusCode.Success,
                    stripe_account: customer_id.stripeAccount,
                    customer_id: customer_id.customerId
                }
            }

            const user = await prisma.user.findFirst({
                where: {
                    id: args.user_id
                }
            })

            if (!user) {
                return {
                    status: StatusCode.InternalError,
                    message: 'Failed to find user'
                }
            }

            const artist = await prisma.artist.findFirst({
                where: {
                    id: args.artist_id
                }
            })

            if (!artist) {
                return {
                    status: StatusCode.InternalError,
                    message: 'Failed to find artist'
                }
            }

            // Otherwise we need to create a customer id for the user
            const stripe_customer = await StripeCreateCustomer(artist.stripeAccId!, user.name!, user.email!)

            // Create a customer id object in the data for this user
            await prisma.stripeCustomerIds.create({
                data: {
                    userId: user.id,
                    artistId: artist.id,
                    stripeAccount: artist.stripeAccId,
                    customerId: stripe_customer.id
                }
            })

            return { status: StatusCode.Success }
        }
    })
)

builder.mutationField('update_payment_intent', (t) =>
    t.field({
        type: 'NemuResponse',
        args: {
            submission_id: t.arg({
                type: 'String',
                required: true,
                description: ''
            }),
            form_id: t.arg({
                type: 'String',
                required: true,
                description: ''
            }),
            payment_intent: t.arg({
                type: 'String',
                required: true,
                description: ''
            }),
            stripe_account: t.arg({
                type: 'String',
                required: true,
                description: ''
            }),

            accepted: t.arg({
                type: 'Boolean',
                required: true,
                description: ''
            })
        },
        resolve: async (_parent, args, _ctx, _info) => {
            // Capture or Reject the Charge
            if (args.accepted) {
                await StripeAcceptCommissionPaymentIntent(args.payment_intent, args.stripe_account)
            } else {
                await StripeRejectCommissionPaymentIntent(args.payment_intent, args.stripe_account)
            }

            // Update Form Submission
            await prisma.formSubmission.update({
                where: {
                    id: args.submission_id
                },
                data: {
                    paymentStatus: args.accepted ? PaymentStatus.Captured : PaymentStatus.Cancelled,
                    commissionStatus: args.accepted ? CommissionStatus.Accepted : CommissionStatus.Rejected
                }
            })

            // Update the form
            await prisma.form.update({
                where: {
                    id: args.form_id
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

            return {
                status: StatusCode.Success
            }
        }
    })
)

builder.mutationField('update_commission_invoice', (t) =>
    t.field({
        type: 'NemuResponse',
        args: {
            customer_id: t.arg({
                type: 'String',
                required: true,
                description: ''
            }),
            stripe_account: t.arg({
                type: 'String',
                required: true,
                description: ''
            }),
            submission_id: t.arg({
                type: 'String',
                required: true,
                description: ''
            }),
            form_id: t.arg({
                type: 'String',
                required: true,
                description: ''
            }),
            accepted: t.arg({
                type: 'Boolean',
                required: true,
                description: ''
            })
        },
        resolve: async (_parent, args, _ctx, _info) => {
            // Get Form Submission for metadata requests on stripe
            const submission = await prisma.formSubmission.findFirst({
                where: {
                    id: args.submission_id
                },
                include: {
                    user: true,
                    form: true
                }
            })

            // Update the form
            await prisma.form.update({
                where: {
                    id: args.form_id
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

            // Check if we rejected the request
            if (!args.accepted) {
                await prisma.formSubmission.update({
                    where: {
                        id: args.submission_id
                    },
                    data: {
                        paymentStatus: PaymentStatus.Cancelled,
                        commissionStatus: CommissionStatus.Rejected
                    }
                })

                return { status: StatusCode.Success }
            }


            // Create a sendbird user if they don't have one already
            await CheckCreateSendbirdUser(submission?.userId!)
            
            // Create Channel For Sendbird
            const sendbird_channel_url = crypto.randomUUID()
            await CreateSendbirdMessageChannel(submission?.id!, sendbird_channel_url)

            // Update Form Submission
            await prisma.formSubmission.update({
                where: {
                    id: submission?.id
                },
                data: {
                    sendbirdChannelURL: sendbird_channel_url
                }
            })

            // Create The Invoice Draft on Stripe
            const invoice_draft = await StripeCreateCommissionInvoice(
                args.customer_id,
                args.stripe_account,
                submission?.user.id!,
                submission?.orderId!,
                submission?.form.commissionId!
            )

            // Update the form submission
            await prisma.formSubmission.update({
                where: {
                    id: args.submission_id
                },
                data: {
                    invoiceId: invoice_draft.id,
                    paymentStatus: PaymentStatus.InvoiceCreated,
                    commissionStatus: CommissionStatus.Accepted
                }
            })

            return { status: StatusCode.Success }
        }
    })
)

builder.mutationField('finalize_invoice', (t) =>
    t.field({
        type: 'NemuResponse',
        args: {
            submission_id: t.arg({
                type: 'String',
                required: true,
                description: ''
            }),
            stripe_acccount: t.arg({
                type: 'String',
                required: true,
                description: ''
            })
        },
        resolve: async (_parent, args, _ctx, _info) => {
            const submission = await prisma.formSubmission.findFirst({
                where: {
                    id: args.submission_id
                }
            })

            if (!submission) {
                return {
                    status: StatusCode.InternalError,
                    message: 'Failed to find submission'
                }
            }

            const invoice = await StripeFinalizeCommissionInvoice(submission.invoiceId!, args.stripe_acccount)

            // Update Submission
            const updated_submission = await prisma.formSubmission.update({
                where: {
                    id: args.submission_id
                },
                data: {
                    paymentStatus: PaymentStatus.InvoiceNeedsPayment,
                    invoiceHostedUrl: invoice.hosted_invoice_url,
                    invoiceSent: true
                }
            })

            if (!updated_submission) {
                return {
                    status: StatusCode.InternalError,
                    message: 'Failed to update submission'
                }
            }

            return { status: StatusCode.Success }
        }
    })
)
