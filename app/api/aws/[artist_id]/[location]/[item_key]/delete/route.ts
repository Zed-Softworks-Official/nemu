import { NemuResponse, StatusCode } from '@/core/responses'
import { S3Delete } from '@/core/storage'
import { StringToAWSLocationsEnum } from '@/core/structures'
import { NextResponse } from 'next/server'

export async function GET(
    req: Request,
    { params }: { params: { artist_id: string; location: string; item_key: string } }
) {
    const aws_response = await S3Delete(
        params.artist_id,
        StringToAWSLocationsEnum(params.location),
        params.item_key
    )

    if (aws_response.$metadata.httpStatusCode != StatusCode.Success) {
        return NextResponse.json<NemuResponse>({
            status: aws_response.$metadata.httpStatusCode as StatusCode,
            message: aws_response.$metadata.cfId
        })
    }

    return NextResponse.json<NemuResponse>({
        status: StatusCode.Success
    })
}
