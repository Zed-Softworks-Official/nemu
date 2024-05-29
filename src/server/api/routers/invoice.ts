import { createId } from '@paralleldrive/cuid2'
import { TRPCError } from '@trpc/server'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { artistProcedure, createTRPCRouter } from '~/server/api/trpc'
import { invoice_items, invoices, stripe_customer_ids } from '~/server/db/schema'

export const invoiceRouter = createTRPCRouter({
    add_invoice_item: artistProcedure
        .input(
            z.object({
                invoice_id: z.string(),
                items: z.array(
                    z.object({
                        id: z.string().nullable(),
                        name: z.string(),
                        price: z.number(),
                        quantity: z.number()
                    })
                )
            })
        )
        .mutation(async ({ input, ctx }) => {
            // Create Invoice Item Object
            for (const item of input.items) {
                await ctx.db.insert(invoice_items).values({
                    id: createId(),
                    invoice_id: input.invoice_id,
                    name: item.name,
                    price: item.price.toPrecision(4),
                    quantity: item.quantity
                })
            }
        }),

    send_invoice: artistProcedure.input(z.string()).mutation(async ({ input, ctx }) => {
        // Get the invoice from the db
        const invoice = await ctx.db.query.invoices.findFirst({
            where: eq(invoices.id, input),
            with: {
                invoice_items: true
            }
        })

        if (!invoice) {
            return new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Invoice not found!'
            })
        }

        // Check if the user has a stripe account
        const stripe_account = await ctx.db.query.stripe_customer_ids.findFirst({
            where: and(
                eq(stripe_customer_ids.user_id, ctx.user.id),
                eq(stripe_customer_ids.artist_id, invoice.artist_id)
            )
        })

        if (!stripe_account) {
            return new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'User does not have a stripe account!'
            })
        }
    })
})
