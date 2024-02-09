import { NemuResponse, StatusCode } from '@/core/responses'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function POST(
    req: Request,
    { params }: { params: { user_id: string; form_id: string } }
) {
    const json_data = await req.json()

    const submission = await prisma.formSubmission.create({
        data: {
            userId: params.user_id,
            formId: params.form_id,
            content: JSON.stringify(json_data)
        }
    })

    if (!submission) {
        return NextResponse.json<NemuResponse>({
            status: StatusCode.InternalError,
            message: 'Failed to submit form!'
        })
    }

    return NextResponse.json<NemuResponse>({
        status: StatusCode.Success
    })
}
