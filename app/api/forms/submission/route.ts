import { CreateFormSubmissionStructure } from '@/core/data-structures/form-structures'
import { UpdateCommissionAvailability } from '@/core/helpers'
import { NemuResponse, StatusCode } from '@/core/responses'
import { PaymentStatus } from '@/core/structures'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
    const data = (await req.json()) as CreateFormSubmissionStructure

    const form_submission = await prisma.formSubmission.create({
        data: {
            userId: data.user_id,
            formId: data.form_id,
            content: data.content,
            paymentStatus: PaymentStatus.RequiresInvoice,
            orderId: crypto.randomUUID()
        }
    })

    if (!form_submission) {
        return NextResponse.json<NemuResponse>({
            status: StatusCode.InternalError,
            message: 'Failed to create form submission'
        })
    }

    // Update Commission Availability
    await UpdateCommissionAvailability(data.form_id)

    // Update form values
    await prisma.form.update({
        where: {
            id: data.form_id
        },
        data: {
            submissions: {
                increment: 1
            }
        }
    })

    return NextResponse.json<NemuResponse>({
        status: StatusCode.Success
    })
}
