import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

import { AWSLocations, S3Delete } from '@/helpers/s3'
import { NemuResponse, StatusCode } from '@/helpers/api/request-inerfaces'

//////////////////////////////////////
// Delete Object From S3
//////////////////////////////////////
export async function GET(
    req: Request,
    { params }: { params: { artist_handle: string; item_id: string } }
) {
    let portfolio_item = await prisma.portfolio.findFirst({
        where: {
            image: params.item_id
        }
    })

    await prisma.portfolio.delete({
        where: {
            id: portfolio_item?.id
        }
    })

    const response = await S3Delete(
        params.artist_handle,
        AWSLocations.Portfolio,
        params.item_id
    )

    return NextResponse.json<NemuResponse>({
        status: response.$metadata.httpStatusCode as StatusCode
    })
}
