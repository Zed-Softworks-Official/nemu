import { NemuResponse, StatusCode } from '@/core/responses'
import { S3Delete, S3Upload } from '@/core/storage'
import { AWSLocations, StringToAWSLocationsEnum } from '@/core/structures'
import { NextResponse } from 'next/server'

export async function POST(
    req: Request,
    { params }: { params: { artist_id: string; location: string; item_key: string } }
) {
    const data = await req.formData()
    const file: File | null = data.get('file') as unknown as File

    console.log(file)
    if (!file) {
        return NextResponse.json<NemuResponse>({
            status: StatusCode.Success
        })
    }

    // Get data
    const location = StringToAWSLocationsEnum(params.location)

    console.log(file)

    // Remove old file
    await S3Delete(params.artist_id, location, params.item_key)

    // upload new file
    await S3Upload(params.artist_id, location, file, data.get('new_image_key') as string)

    return NextResponse.json<NemuResponse>({
        status: StatusCode.Success
    })
}
