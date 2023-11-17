import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { AWSLocations, S3GetSignedURL } from '@/helpers/s3'

import {
    NemuResponse,
    PortfolioItem,
    PortfolioResponse,
    StatusCode
} from '@/helpers/api/request-inerfaces'

/**
 * Gets All portfolio items for a given user
 */
export async function GET(
    req: Request,
    { params }: { params: { artist_handle: string } }
) {
    const artist = await prisma.artist.findFirst({
        where: {
            handle: params.artist_handle
        }
    })

    if (!artist) {
        return NextResponse.json<NemuResponse>({
            status: StatusCode.InternalError,
            message: `No Such Artist With the Handle "${params.artist_handle}"`
        })
    }

    const portfolio = await prisma.portfolio.findMany({
        where: {
            userId: artist?.userId
        }
    })

    let items: PortfolioItem[] = []
    for (let i = 0; i < portfolio.length; i++) {
        let url = await S3GetSignedURL(
            params.artist_handle,
            AWSLocations.Portfolio,
            portfolio[i].image
        )
        items.push({
            signed_url: url,
            name: portfolio[i].name,
            key: portfolio[i].image
        })
    }

    return NextResponse.json<PortfolioResponse>({
        status: StatusCode.Success,
        items: items
    })
}
