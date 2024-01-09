import { CommissionFormsResponse, StatusCode } from '@/helpers/api/request-inerfaces'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function GET(
    req: Request,
    { params }: { params: { id: string, form_id: string } }
) {
    const form = await prisma.form.findFirst({ where: { id: params.form_id } })

    if (!form) {
        return NextResponse.json<CommissionFormsResponse>({
            status: StatusCode.InternalError,
            message: 'Could not find form!'
        })
    }

    return NextResponse.json<CommissionFormsResponse>({
        status: StatusCode.Success,
        form: form
    })
}
