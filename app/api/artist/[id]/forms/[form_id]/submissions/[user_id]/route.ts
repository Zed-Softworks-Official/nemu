import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

import { NemuResponse, StatusCode } from '@/helpers/api/request-inerfaces'

export async function GET(
    req: Request,
    { params }: { params: { id: string; form_id: string; user_id: string } }
) {
    const artist = await prisma.artist.findFirst({
        where: {
            userId: params.id
        }
    })

    if (!artist) {
        return NextResponse.json<NemuResponse>({
            status: StatusCode.InternalError,
            message: 'Could not find artist'
        })
    }

    const form = await prisma.form.findFirst({
        where: {
            id: params.form_id,
            artistId: artist.id
        },
        include: {
            formSubmissions: {
                where: {
                    userId: params.user_id
                }
            }
        }
    })

    if (form?.formSubmissions.length != 0) {
        return NextResponse.json<NemuResponse>({
            status: StatusCode.InternalError,
            message: 'Already Commissioned'
        })
    }

    return NextResponse.json<NemuResponse>({
        status: StatusCode.Success
    })
}
