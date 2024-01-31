import { NemuResponse, StatusCode } from '@/core/responses'
import { S3Delete } from '@/core/storage'
import { AWSLocations, StringToAWSLocationsEnum } from '@/core/structures'
import { NextResponse } from 'next/server'

export async function POST(
    req: Request,
    { params }: { params: { artist_id: string; location: string; item_key: string } }
) {
    return NextResponse.json<NemuResponse>({
        status: StatusCode.Success
    })
}
