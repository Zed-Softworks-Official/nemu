import { NemuResponse, StatusCode } from '@/core/responses'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function POST(req: Request, { params }: { params: { form_id: string } }) {
    const data = await req.json()

    const updated = await prisma.form.update({
        where: {
            id: params.form_id
        },
        data: {
            content: JSON.stringify(data)
        }
    })

    if (!updated) {
        return NextResponse.json<NemuResponse>({
            status: StatusCode.InternalError,
            message: 'An Error has occured while updating your form'
        })
    }

    return NextResponse.json<NemuResponse>({
        status: StatusCode.Success
    })
}
