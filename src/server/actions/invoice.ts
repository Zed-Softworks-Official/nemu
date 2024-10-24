'use server'

import { auth, clerkClient } from '@clerk/nextjs/server'
import { eq, and } from 'drizzle-orm'
import { revalidateTag } from 'next/cache'
import { createId } from '@paralleldrive/cuid2'

import { type InvoiceItem, UserRole } from '~/core/structures'
import { db } from '~/server/db'
import { invoice_items, invoices, stripe_customer_ids } from '~/server/db/schema'

/**
 * Saves the invoice items to the database and updates the invoice total
 *
 * @param {string} invoice_id - The id of the invoice to save
 * @param {InvoiceItem[]} items - The items to save to the invoice
 */
export async function save_invoice(invoice_id: string, items: InvoiceItem[]) {
    // Auth Check
    if (!(await check_auth_and_invoice(invoice_id))) {
        return { success: false }
    }

    // Delete the invoice items
    await db.delete(invoice_items).where(eq(invoice_items.invoice_id, invoice_id))

    // Update the invoice items
    let total_cost = 0
    for (const item of items) {
        await db.insert(invoice_items).values({
            id: item.id ?? createId(),
            invoice_id,
            name: item.name,
            price: item.price * 100,
            quantity: item.quantity
        })

        total_cost += item.price * item.quantity
    }

    // Update the invoice total
    await db
        .update(invoices)
        .set({ total: total_cost })
        .where(eq(invoices.id, invoice_id))

    // Invalidate cache
    revalidateTag('commission_requests')

    return { success: true }
}

/**
 * Sends the invoice to the commissioner to request payment
 *
 * @param {string} invoice_id - The id of the invoice to send
 */
export async function send_invoice(invoice_id: string) {
    // Auth Check
    if (!(await check_auth_and_invoice(invoice_id))) {
        return { success: false }
    }

    return { success: true }
}

/**
 * Checks if the user is logged in, if they are an artist, and if the invoice exists
 *
 * @param {string} invoice_id
 */
async function check_auth_and_invoice(invoice_id: string) {
    // Get Auth data
    const auth_data = auth()

    // Check if the user is logged in
    if (!auth_data.userId) {
        console.log('User not logged in')
        return false
    }

    // Check if the user is an artist
    const user = await clerkClient().users.getUser(auth_data.userId)
    if ((!user.publicMetadata.role as unknown as UserRole) === UserRole.Artist) {
        console.log('User is not an artist')
        return false
    }

    // Check if the invoice exists
    const invoice = await db.query.invoices.findFirst({
        where: eq(invoices.id, invoice_id)
    })

    if (!invoice) {
        console.log('Invoice not found')
        return false
    }

    // Check if the user and artist have a stripe account linked
    const stripe_account = await db.query.stripe_customer_ids.findFirst({
        where: and(
            eq(stripe_customer_ids.user_id, invoice.user_id),
            eq(stripe_customer_ids.artist_id, invoice.artist_id)
        )
    })

    if (!stripe_account) {
        console.log('Stripe account not found')
        return false
    }

    return true
}
