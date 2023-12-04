import { NextResponse } from 'next/server'
import { RandomArtistsResponse, StatusCode } from '@/helpers/api/request-inerfaces'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
    const artistCount = await prisma.artist.count()
    const artistSkip = Math.floor(Math.random() * artistCount)

    return NextResponse.json<RandomArtistsResponse>({
        status: StatusCode.Success,
        artists: await prisma.artist.findMany({
            take: 5,
            //skip: artistSkip
        })
    })
}
