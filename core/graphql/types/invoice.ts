import { StatusCode } from '@/core/responses'
import { builder } from '../builder'
import { prisma } from '@/lib/prisma'
import { StripeFinalizeCommissionInvoice, StripeUpdateCommissionInvoice } from '@/core/stripe/commissions'
import { novu } from '@/lib/novu'
import { PaymentStatus } from '@/core/structures'

builder.prismaObject('Invoice', {
    fields: (t) => ({
        id: t.exposeString('id'),
        sent: t.exposeBoolean('sent'),
        hostedUrl: t.exposeString('hostedUrl', { nullable: true }),
        paymentStatus: t.exposeInt('paymentStatus'),
        paymentIntent: t.exposeString('paymentIntent', { nullable: true }),

        stripeId: t.exposeString('stripeId', { nullable: true }),
        createdAt: t.expose('createdAt', { type: 'Date' }),

        customerId: t.exposeString('customerId'),
        stripeAccount: t.exposeString('stripeAccount'),

        userId: t.exposeString('userId'),
        artistId: t.exposeString('artistId'),

        submissionId: t.exposeString('submissionId'),

        items: t.relation('items'),

        commission_data: t.field({
            type: 'InvoiceCommissionData',
            resolve: async (invoice) => {
                // Get Form Submission with all relavent data
                const submission = await prisma.formSubmission.findFirst({
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

                return {
                    title: submission?.form.commission?.title!,
                    total_price: total_price,
                    artist_handle: submission?.form.commission?.artist.handle!,
                    commission_url: `${process.env.BASE_URL}/@${submission?.form.commission?.artist.handle}/${submission?.form.commission?.slug}`
                }
            }
        })
    })
})

builder.queryField('invoices', (t) =>
    t.prismaField({
        type: ['Invoice'],
        args: {
            user_id: t.arg({
                type: 'String',
                description: 'The user id to get the invoices for'
            }),
            newest_first: t.arg({
                type: 'Boolean',
                description: 'Order by newest'
            })
        },
        resolve: (query, _parent, args) =>
            prisma.invoice.findMany({
                ...query,
                where: {
                    userId: args.user_id || undefined
                },
                orderBy: {
                    createdAt: args.newest_first ? 'desc' : 'asc'
                }
            })
    })
)

builder.mutationField('update_invoice', (t) =>
    t.field({
        type: 'NemuResponse',
        args: {
            invoice_id: t.arg({
                type: 'String',
                required: true
            }),
            invoice_items: t.arg({
                type: ['InvoiceItemInputType'],
                required: true
            })
        },
        resolve: async (_parent, args) => {
            // Update invoice items
            for (const item of args.invoice_items) {
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
                        invoiceId: args.invoice_id,
                        name: item.name!,
                        price: item.price!,
                        quantity: item.quantity!
                    }
                })
            }

            return {
                status: StatusCode.Success
            }
        }
    })
)

builder.mutationField('send_invoice', (t) =>
    t.field({
        type: 'NemuResponse',
        args: {
            invoice_id: t.arg({
                type: 'String',
                required: true
            })
        },
        resolve: async (_parent, args) => {
            // Retrieve invoice from database
            const invoice = await prisma.invoice.findFirst({
                where: {
                    id: args.invoice_id
                },
                include: {
                    items: true
                }
            })

            if (!invoice) {
                return {
                    status: StatusCode.InternalError,
                    message: 'Could not retrieve invoice'
                }
            }

            // Update the stripe invoice draft
            await StripeUpdateCommissionInvoice(invoice.customerId, invoice.stripeAccount, invoice.stripeId!, invoice.items!)

            // Finialize the invoice
            const stripe_invoice = await StripeFinalizeCommissionInvoice(invoice.stripeId!, invoice.stripeAccount)

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

            return {
                status: StatusCode.Success
            }
        }
    })
)
