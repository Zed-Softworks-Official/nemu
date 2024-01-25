import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

import { S3GetSignedURL, S3Upload } from '@/core/storage'
import { AWSLocations, PortfolioItem } from '@/core/structures'
import { NemuResponse, PortfolioResponse, StatusCode } from '@/core/responses'

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

    // Determine the location of the object
    const database_item = await prisma.portfolio.findFirst({
        where: {
            image: params.item_id
        }
    })

    const item: PortfolioItem = {
        name: database_item!.name,
        signed_url: await S3GetSignedURL(
            params.artist_handle,
            AWSLocations.Portfolio,
            params.item_id
        ),
        key: params.item_id
    }

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
            userId: artist?.userId,
        }
    })

    // Upload file
    const upload = await S3Upload(
        params.artist_handle,
        AWSLocations.Portfolio,
        file,
        params.item_id
    )

    return NextResponse.json<NemuResponse>({
        status: upload.$metadata.httpStatusCode as StatusCode
    })
}
