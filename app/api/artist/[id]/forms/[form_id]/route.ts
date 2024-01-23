import { FormElementInstance } from '@/components/form-builder/elements/form-elements'
import {
    CommissionFormsResponse,
    NemuResponse,
    StatusCode
} from '@/core/responses'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

/**
 * Handles retrieving a single form from the dashboard
 * 
 * @param id - userId
 */
export async function GET(
    req: Request,
    { params }: { params: { id: string; form_id: string } }
) {
    const artist = await prisma.artist.findFirst({
        where: {
            userId: params.id
        }
    })

    const form = await prisma.form.findFirst({
        where: { id: params.form_id, artistId: artist?.id },
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
        form: form
    })
}

/**
 * Hanldes saving and updating forms from the dashboard
 * 
 * @param id - userId
 */
export async function POST(
    req: Request,
    { params }: { params: { id: string; form_id: string } }
) {
    const newFormContent = await req.json()

    const artist = await prisma.artist.findFirst({
        where: {
            userId: params.id
        }
    })

    await prisma.form.update({
        where: {
            id: params.form_id,
            artistId: artist?.id
        },
        data: {
            content: JSON.stringify(newFormContent)
        }
    })

    return NextResponse.json<NemuResponse>({
        status: StatusCode.Success
    })
}
