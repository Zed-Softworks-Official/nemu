import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

import { CommissionFormsResponse, StatusCode } from '@/helpers/api/request-inerfaces'
import { FormElementInstance } from '@/components/form-builder/elements/form-elements'

/**
 * Gets the content of each form, used to create the form field a user interacts with
 *
 * @param id - userId
 */
export async function GET(
    req: Request,
    { params }: { params: { id: string; form_id: string } }
) {
    // Get the artist
    const artist = await prisma.artist.findFirst({
        where: {
            userId: params.id
        }
    })

    if (!artist) {
        return NextResponse.json<CommissionFormsResponse>({
            status: StatusCode.InternalError,
            message: 'Could not find requested artist'
        })
    }

    const form = await prisma.form.findFirst({
        where: {
            id: params.form_id,
            artistId: artist.id
        }
    })

    if (!form) {
        return NextResponse.json<CommissionFormsResponse>({
            status: StatusCode.InternalError,
            message: 'Could not find requested form'
        })
    }

    return NextResponse.json<CommissionFormsResponse>({
        status: StatusCode.Success,
        formContent: JSON.parse(form.content) as unknown as FormElementInstance[]
    })
}
