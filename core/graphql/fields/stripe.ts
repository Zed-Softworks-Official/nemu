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
import { CheckCreateSendbirdUser, CreateSendbirdMessageChannel } from '@/core/server-helpers'
import { novu } from '@/lib/novu'

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
            const stripe_customer = await StripeCreateCustomer(artist.stripeAccount!, user.name!, user.email!)

            // Create a customer id object in the data for this user
            await prisma.stripeCustomerIds.create({
                data: {
                    userId: user.id,
                    artistId: artist.id,
                    stripeAccount: artist.stripeAccount,
                    customerId: stripe_customer.id
                }
            })

            return { status: StatusCode.Success }
        }
    })
)
