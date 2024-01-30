import { NextResponse } from 'next/server'

import { S3Upload } from '@/core/storage'
import { StringToAWSLocationsEnum } from '@/core/structures'
import { NemuResponse, StatusCode } from '@/core/responses'

/**
 * POST Method for API for a SINGLE item
 *
 * Creates the requested item in S3 and our Database
 */
export async function POST(
    req: Request,
    { params }: { params: { artist_id: string; location: string; item_key: string } }
) {
    // Get Form Data
    const data = await req.json()
    const file: File | null = data.file

    if (!file) {
        console.log('invalid file')
        
        return NextResponse.json<NemuResponse>({
            status: StatusCode.InternalError,
            message: 'Failed to find file'
        })
    }

    // Upload file
    const upload = await S3Upload(
        params.artist_id,
        StringToAWSLocationsEnum(params.location),
        file,
        params.item_key
    )

    return NextResponse.json<NemuResponse>({
        status: upload.$metadata.httpStatusCode as StatusCode
    })
}
