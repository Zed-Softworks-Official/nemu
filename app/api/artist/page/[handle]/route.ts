import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

import { ArtistPageResponse, StatusCode } from '@/helpers/api/request-inerfaces'

export async function GET(req: Request, { params }: { params: { handle: string } }) {
    const artist = await prisma.artist.findFirst({
        where: {
            handle: params.handle
        }
    })

    if (!artist) {
        return NextResponse.json<ArtistPageResponse>({
            status: StatusCode.InternalError,
            message: 'Unable to find artist',
            artist: null,
            user: null
        })
    }

    const user = await prisma.user.findFirst({
        where: {
            id: artist.userId
        }
    })

    if (!user) {
        return NextResponse.json<ArtistPageResponse>({
            status: StatusCode.InternalError,
            message: 'Unable to find user',
            artist: null,
            user: null
        })
    }

    return NextResponse.json<ArtistPageResponse>({
        status: StatusCode.Success,
        artist: artist,
        user: user
    })
}
