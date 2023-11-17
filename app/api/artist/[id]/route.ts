import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { ArtistResponse } from '@/helpers/api/request-inerfaces'

export async function GET(req: Request, { params }: { params: { id: string } }) {
    let artist = await prisma.artist.findFirst({
        where: {
            userId: params.id
        }
    })

    return NextResponse.json<ArtistResponse>({
        status: 200,
        info: artist
    })
}
