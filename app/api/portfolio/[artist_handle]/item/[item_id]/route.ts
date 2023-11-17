import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

import { AWSLocations, S3Upload } from '@/helpers/s3'
import { GetPortfolioItem } from '@/helpers/api/request-item'
import {
    NemuResponse,
    PortfolioResponse,
    StatusCode
} from '@/helpers/api/request-inerfaces'

/**
 * GET Method for API for a SINGLE item
 *
 * Gets the requeted item from S3 and our database
 */
export async function GET(
    req: Request,
    { params }: { params: { artist_handle: string; item_id: string } }
) {
    ////////////////////////////
    // Determine where the
    // object is and retrieve it
    ////////////////////////////
    let item = await GetPortfolioItem(params.artist_handle, params.item_id)

    // Return item data
    return NextResponse.json<PortfolioResponse>({
        status: StatusCode.Success,
        item: item
    })
}

/**
 * POST Method for API for a SINGLE item
 *
 * Creates the requested item in S3 and our Database
 */
export async function POST(
    req: Request,
    { params }: { params: { artist_handle: string; item_id: string } }
) {
    // Get Form Data
    let data = await req.formData()
    const file: File | null = data.get('dropzone-file') as unknown as File

    // Get Artist Information
    const artist = await prisma.artist.findFirst({
        where: {
            handle: params.artist_handle
        }
    })

    // Create Portfolio Item
    await prisma.portfolio.create({
        data: {
            image: params.item_id,
            name: data.get('title')!.toString(),
            userId: artist?.userId
        }
    })

    // Upload file
    const upload = await S3Upload(params.artist_handle, AWSLocations.Portfolio, file, params.item_id)

    return NextResponse.json<NemuResponse>({
        status: upload.$metadata.httpStatusCode as StatusCode
    })
}
