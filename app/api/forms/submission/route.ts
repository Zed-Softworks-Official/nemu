import { CreateFormSubmissionStructure } from '@/core/data-structures/form-structures'
import { NemuResponse, StatusCode } from '@/core/responses'
import { PaymentStatus } from '@/core/structures'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
    const data = await req.json() as CreateFormSubmissionStructure

    const form_submission = await prisma.formSubmission.create({
        data: {
            userId: data.user_id,
            formId: data.form_id,
            content: data.content,
            pyamentStatus: PaymentStatus.RequiresInvoice
        }
    })

    if (!form_submission) {
        return NextResponse.json<NemuResponse>({
            status: StatusCode.InternalError,
            message: 'Failed to createe form submission'
        })
    }

    return NextResponse.json<NemuResponse>({
        status: StatusCode.Success
    })
}
