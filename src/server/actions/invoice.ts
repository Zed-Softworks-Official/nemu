'use server'

import { auth } from '@clerk/nextjs/server'

import type { InvoiceItem } from '~/core/structures'

export async function save_invoice(invoice_id: string, items: InvoiceItem[]) {
    // Auth Check
    if (!(await check_auth_and_invoice(invoice_id))) {
        return { success: false }
    }

    // Update the invoice items

    return { success: true }
}

export async function send_invoice(invoice_id: string) {
    // Auth Check
    if (!(await check_auth_and_invoice(invoice_id))) {
        return { success: false }
    }

    return { success: true }
}

async function check_auth_and_invoice(invoice_id: string) {
    // Get Auth data
    const auth_data = auth()

    // Check if the user is logged in
    if (!auth_data.userId) {
        return false
    }

    // Check if the user is an artist

    // Check if the invoice exists

    // Check if the invoice belongs to the artist and the user

    return true
}
