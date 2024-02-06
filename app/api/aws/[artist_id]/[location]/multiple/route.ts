import { NemuResponse, StatusCode } from '@/core/responses'
import { S3Upload } from '@/core/storage'
import { StringToAWSLocationsEnum } from '@/core/structures'
import { NextResponse } from 'next/server'

export async function POST(
    req: Request,
    { params }: { params: { artist_id: string; location: string } }
) {
    const aws_data = await req.formData()
    const file_keys = JSON.parse(aws_data.get('file_keys') as string)

    // upload featured image
    await S3Upload(
        params.artist_id,
        StringToAWSLocationsEnum(params.location),
        aws_data.get('featured_image') as unknown as File,
        file_keys[0]
    )

    // upload additional files
    for (let i = 0; i < file_keys.length - 1; i++) {
        await S3Upload(
            params.artist_id,
            StringToAWSLocationsEnum(params.location),
            aws_data.get(`file-${i}`) as unknown as File,
            file_keys[i + 1]
        )
    }

    return NextResponse.json<NemuResponse>({
        status: StatusCode.Success
    })
}
