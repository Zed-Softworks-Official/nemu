import { builder } from '../builder'
import {
    StripeAcceptCommissionPaymentIntent,
    StripeCreateCommissionInvoice,
    StripeRejectCommissionPaymentIntent
} from '@/core/stripe/commissions'

import { prisma } from '@/lib/prisma'
import { StatusCode } from '@/core/responses'
import { PaymentStatus } from '@/core/structures'
import { StripeCreateCustomer } from '@/core/payments'

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
            const stripe_customer = await StripeCreateCustomer(
                artist.stripeAccId!,
                user.name!,
                user.email!
            )

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

            value: t.arg({
                type: 'Boolean',
                required: true,
                description: ''
            })
        },
        resolve: async (_parent, args, _ctx, _info) => {
            // Capture Charge
            const payment_intent = await StripeAcceptCommissionPaymentIntent(
                args.payment_intent,
                args.stripe_account
            )

            if (payment_intent.status != 'succeeded') {
                return {
                    status: StatusCode.InternalError,
                    message: 'An error has occurred with capturing the payment'
                }
            }

            // Update Form Submission
            await prisma.formSubmission.update({
                where: {
                    id: args.submission_id
                },
                data: {
                    pyamentStatus: PaymentStatus.Captured,
                    orderId: crypto.randomUUID()
                }
            })

            // Update the form
            await prisma.form.update({
                where: {
                    id: args.form_id
                },
                data: {
                    submissions: {
                        decrement: 1
                    },
                    acceptedSubmissions: {
                        increment: args.value ? 1 : 0
                    },
                    rejectedSubmissions: {
                        increment: !args.value ? 1 : 0
                    }
                }
            })

            return {
                status: StatusCode.Success
            }
        }
    })
)

builder.mutationField('create_invoice', (t) =>
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
            })
        },
        resolve: async (_parent, args, _ctx, _info) => {
            const invoice_draft = await StripeCreateCommissionInvoice(
                args.customer_id,
                args.stripe_account
            )

            await prisma.formSubmission.update({
                where: {
                    id: args.submission_id
                },
                data: {
                    invoiceId: invoice_draft.id,
                    pyamentStatus: PaymentStatus.InvoiceCreated
                }
            })

            await prisma.form.update({
                where: {
                    id: args.form_id
                },
                data: {
                    submissions: {
                        decrement: 1
                    },
                    acceptedSubmissions: {
                        increment: 1
                    }
                }
            })

            return { status: StatusCode.Success }
        }
    })
)
