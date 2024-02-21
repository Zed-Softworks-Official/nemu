import { NemuResponse, StatusCode } from '@/core/responses'
import { StripeUpdateCommissionInvoice } from '@/core/stripe/commissions'
import { UpdateInvoiceData } from '@/core/structures'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
    const data = (await req.json()) as UpdateInvoiceData

    // Update Invoice In database
    const updated_invoice = await prisma.formSubmission.update({
        where: {
            id: data.submission_id
        },
        data: {
            invoiceContent: JSON.stringify(data.items)
        }
    })

    // Check if it worked
    if (!updated_invoice) {
        return NextResponse.json<NemuResponse>({
            status: StatusCode.Success,
            message: 'Unable to save invoice changes!'
        })
    }

    // Update Stripe Invoice
    await StripeUpdateCommissionInvoice(data.customer_id, data.stripe_account, updated_invoice.invoiceId!, data.items)

    return NextResponse.json<NemuResponse>({ status: StatusCode.Success })
}
