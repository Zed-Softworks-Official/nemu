import { NemuResponse, StatusCode } from '@/core/responses'
import { S3Upload } from '@/core/storage'
import { AWSFileModification, AWSEndpoint, StringToAWSLocationsEnum } from '@/core/structures'
import { NextResponse } from 'next/server'

export async function POST(req: Request, { params }: { params: { artist_id: string; location: string } }) {
    const aws_data = await req.formData()
    const additional_files = JSON.parse(aws_data.get('additional_files') as string) as AWSFileModification[]
    const downloadable_asset = aws_data.get('downloadable_asset') as unknown as File | null

    // upload featured image
    await S3Upload(
        params.artist_id,
        StringToAWSLocationsEnum(params.location),
        aws_data.get('featured_image') as unknown as File,
        aws_data.get('featured_image_key') as string
    )

    // upload additional files
    for (let i = 0; i < additional_files.length; i++) {
        await S3Upload(
            params.artist_id,
            additional_files[i].aws_location,
            aws_data.get(`file-${additional_files[i].file_key}`) as unknown as File,
            additional_files[i].file_key
        )
    }

    // return if no downloadable asset is present
    if (!downloadable_asset) {
        return NextResponse.json<NemuResponse>({
            status: StatusCode.Success
        })
    }

    // Upload the asset if present
    await S3Upload(params.artist_id, AWSEndpoint.Downloads, downloadable_asset, aws_data.get('downloadable_asset_key') as string)

    return NextResponse.json<NemuResponse>({
        status: StatusCode.Success
    })
}
