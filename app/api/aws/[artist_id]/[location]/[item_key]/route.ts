import { NextResponse } from 'next/server'

import { S3Upload } from '@/core/storage'
import { StringToAWSLocationsEnum } from '@/core/structures'
import { FileResponse, NemuResponse, StatusCode } from '@/core/responses'
import { getServerAuthSession } from '@/core/auth'

/**
 * POST Method for API for a SINGLE item
 *
 * Creates the requested item in S3 and our Database
 */
export async function POST(
    req: Request,
    { params }: { params: { artist_id: string; location: string; item_key: string } }
) {
    const session = await getServerAuthSession()

    if (!session) {
        return NextResponse.error()
    }

    // Get Form Data
    const data = await req.formData()
    const file: File | null = data.get('file') as unknown as File

    if (!file) {
        console.log('invalid file')

        return NextResponse.json<NemuResponse>({
            status: StatusCode.InternalError,
            message: 'Failed to find file'
        })
    }

    // // Upload file
    const upload = await S3Upload(
        params.artist_id,
        StringToAWSLocationsEnum(params.location),
        file,
        params.item_key
    )

    return NextResponse.json<FileResponse>({
        status: upload.$metadata.httpStatusCode as StatusCode,
        file_key: params.item_key
    })
}
