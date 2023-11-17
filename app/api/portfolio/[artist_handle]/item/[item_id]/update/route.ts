import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { AWSLocations, S3Delete, S3Upload } from '@/helpers/s3'
import { NemuResponse, StatusCode } from '@/helpers/api/request-inerfaces'

//////////////////////////////////////////
// POST Item To AWS API Route
//////////////////////////////////////////
export async function POST(
    req: Request,
    { params }: { params: { artist_handle: string; item_id: string } }
) {
    // Get the form data
    let data = await req.formData()
    const file = data.get('dropzone-file') as unknown as File

    // Get the original portfolio item
    let image = await prisma.portfolio.findFirst({
        where: {
            image: params.item_id
        }
    })

    // CHeck if the title is changed and update it
    let title: string
    if (data.get('title') != '') {
        title = data.get('title') as string
    } else {
        title = image?.name!
    }

    await prisma.portfolio.update({
        where: {
            id: image!.id
        },
        data: {
            name: title
        }
    })

    if (file.size != 0) {
        // Delete the portfolio item
        await S3Delete(params.artist_handle, AWSLocations.Portfolio, params.item_id)

        // Upload the new item
        await S3Upload(params.artist_handle, AWSLocations.Portfolio, file, params.item_id)
    }

    return NextResponse.json<NemuResponse>({
        status: StatusCode.Success
    })
}
