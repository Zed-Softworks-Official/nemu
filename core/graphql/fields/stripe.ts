import { builder } from '../builder'
import {
    StripeAcceptCommissionPaymentIntent,
    StripeRejectCommissionPaymentIntent
} from '@/core/stripe/commissions'

import { prisma } from '@/lib/prisma'
import { StatusCode } from '@/core/responses'
import { PaymentStatus } from '@/core/structures'

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