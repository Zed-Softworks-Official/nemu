import { FormElementInstance } from '@/components/form-builder/elements/form-elements'
import {
    CommissionFormsResponse,
    NemuResponse,
    StatusCode
} from '@/helpers/api/request-inerfaces'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function GET(
    req: Request,
    { params }: { params: { id: string; form_id: string } }
) {
    const form = await prisma.form.findFirst({
        where: { id: params.form_id },
        include: { formSubmissions: true }
    })

    if (!form) {
        return NextResponse.json<CommissionFormsResponse>({
            status: StatusCode.InternalError,
            message: 'Could not find form!'
        })
    }

    return NextResponse.json<CommissionFormsResponse>({
        status: StatusCode.Success,
        form: form,
        formContent: JSON.parse(form.content) as unknown as FormElementInstance[]
    })
}

export async function POST(
    req: Request,
    { params }: { params: { id: string; form_id: string } }
) {
    const newFormContent = await req.json()

    await prisma.form.update({
        where: {
            id: params.form_id
        },
        data: {
            content: JSON.stringify(newFormContent)
        }
    })

    return NextResponse.json<NemuResponse>({
        status: StatusCode.Success
    })
}
