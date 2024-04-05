import { z } from 'zod'
import {
    artistProcedure,
    createTRPCRouter,
    protectedProcedure
} from '../trpc'
import { redis } from '@/lib/redis'
import { prisma } from '@/lib/prisma'
import { novu } from '@/lib/novu'
import { AsRedisKey } from '@/core/helpers'
import { Invoice } from '@prisma/client'
import { InvoiceCommissionData, PaymentStatus } from '@/core/structures'
import {
    StripeFinalizeCommissionInvoice,
    StripeUpdateCommissionInvoice
} from '@/core/stripe/commissions'

type InvoiceReturnType = Invoice & { commission_data: InvoiceCommissionData }

export const invoicesRouter = createTRPCRouter({
    /**
     * Gets ALL invoices for a user
     */
    get_invoices: protectedProcedure.query(async (opts) => {
        const { ctx } = opts

        const cachedInvoices = await redis.get(
            AsRedisKey('invoices', ctx.session.user.user_id!)
        )

        if (cachedInvoices) {
            return JSON.parse(cachedInvoices) as InvoiceReturnType[]
        }

        const invoices = await prisma.invoice.findMany({
            where: {
                userId: ctx.session.user.user_id!
            },
            orderBy: {
                createdAt: 'desc'
            }
        })

        if (!invoices) {
            return undefined
        }

        const result: InvoiceReturnType[] = []
        for (const invoice of invoices) {
            const submission = await prisma.request.findFirst({
                where: {
                    invoiceId: invoice.id
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

            // Get invoice items
            const invoice_items = await prisma.invoiceItem.findMany({
                where: {
                    invoiceId: invoice.id
                }
            })

            // Get total price
            let total_price: number = 0
            for (const item of invoice_items) {
                total_price += item.price * item.quantity
            }

            result.push({
                ...invoice,
                commission_data: {
                    title: submission?.form.commission?.title!,
                    total_price: total_price,
                    artist_handle: submission?.form.commission?.artist.handle!,
                    commission_url: `${process.env.BASE_URL}/@${submission?.form.commission?.artist.handle}/${submission?.form.commission?.slug}`
                }
            })
        }

        await redis.set(
            AsRedisKey('invoices', ctx.session.user.user_id!),
            JSON.stringify(result),
            'EX',
            3600
        )

        return result
    }),

    /**
     * Updates a specific invoice
     */
    update_invoice: artistProcedure
        .input(
            z.object({
                invoice_id: z.string(),
                invoice_items: z.array(
                    z.object({
                        id: z.string().optional(),
                        name: z.string().optional(),
                        price: z.number().optional(),
                        quantity: z.number().optional(),
                        delete: z.boolean().optional()
                    })
                )
            })
        )
        .mutation(async (opts) => {
            const { input } = opts

            // Update invoice items
            for (const item of input.invoice_items) {
                // If we have an item id then that means this item
                // already exists and we should update it
                if (item.id) {
                    // Check if the item has been deleted
                    if (item.delete) {
                        await prisma.invoiceItem.delete({
                            where: {
                                id: item.id
                            }
                        })

                        continue
                    }

                    // If not then just update the item
                    await prisma.invoiceItem.update({
                        where: {
                            id: item.id
                        },
                        data: {
                            name: item.name || undefined,
                            price: item.price || undefined,
                            quantity: item.quantity || undefined
                        }
                    })

                    continue
                }

                if (item.delete) {
                    continue
                }

                // If we don't have an id then we want to create the
                // new invoice item
                await prisma.invoiceItem.create({
                    data: {
                        invoiceId: input.invoice_id,
                        name: item.name!,
                        price: item.price!,
                        quantity: item.quantity!
                    }
                })
            }

            return { success: true }
        }),

    /**
     * Sends the invoice to the user for payment
     */
    send_invoice: artistProcedure.input(z.string()).mutation(async (opts) => {
        const { input } = opts

        // Retrieve invoice from database
        const invoice = await prisma.invoice.findFirst({
            where: {
                id: input
            },
            include: {
                items: true
            }
        })

        if (!invoice) {
            return { success: false }
        }

        // Update the stripe invoice draft
        await StripeUpdateCommissionInvoice(
            invoice.customerId,
            invoice.stripeAccount,
            invoice.stripeId!,
            invoice.items!
        )

        // Finialize the invoice
        const stripe_invoice = await StripeFinalizeCommissionInvoice(
            invoice.stripeId!,
            invoice.stripeAccount
        )

        // Update invoice
        await prisma.invoice.update({
            where: {
                id: invoice.id
            },
            data: {
                sent: true,
                hostedUrl: stripe_invoice.hosted_invoice_url,
                paymentStatus: PaymentStatus.InvoiceNeedsPayment
            }
        })

        // Retrieve Artist
        const artist = await prisma.artist.findFirst({
            where: {
                id: invoice.artistId
            }
        })

        // Notify User of the invoice being sent
        novu.trigger('invoices', {
            to: {
                subscriberId: invoice?.userId
            },
            payload: {
                status: 'sent',
                username: artist?.handle,
                invoice_url: `${process.env.BASE_URL}/invoices`
            }
        })

        return { success: true }
    })
})
