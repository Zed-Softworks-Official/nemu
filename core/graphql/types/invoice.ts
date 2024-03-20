import { StatusCode } from '@/core/responses'
import { builder } from '../builder'
import { prisma } from '@/lib/prisma'

builder.prismaObject('Invoice', {
    fields: (t) => ({
        id: t.exposeString('id'),
        sent: t.exposeBoolean('sent'),
        hostedUrl: t.exposeString('hostedUrl', { nullable: true }),

        stripeId: t.exposeString('stripeId'),
        createdAt: t.expose('createdAt', { type: 'Date' }),

        customerId: t.exposeString('customerId'),
        stripeAccount: t.exposeString('stripeAccount'),

        userId: t.exposeString('userId'),
        artistId: t.exposeString('artistId'),

        items: t.relation('items')
    })
})

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

                    break
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
                }
            })

            // Update the stripe invoice draft

            // Finialize the invoice

            // Update invoice

            // Notify User

            return {
                status: StatusCode.Success
            }
        }
    })
)
