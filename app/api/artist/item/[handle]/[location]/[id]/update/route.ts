import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { S3Delete, S3Upload, StringToAWSLocationsEnum } from '@/helpers/s3'

//////////////////////////////////////////
// POST Item To AWS API Route
//////////////////////////////////////////
export async function POST(
    req: Request,
    { params }: { params: { handle: string; location: string; id: string } }
) {

    // Get the form data
    let data = await req.formData()
    const file = data.get('dropzone-file') as unknown as File

    // Get the original portfolio item
    let image = await prisma.portfolio.findFirst({
        where: {
            image: params.id
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

    // TODO: Temporary Fix, Figure out why file has a length of 9 when it's undefined, in other words figure out why an undefined item is not undefined

    if (file.name) {
        // Delete the portfolio item
        await S3Delete(
            params.handle,
            StringToAWSLocationsEnum(params.location),
            params.id
        )

        // Upload the new item
        return S3Upload(
            params.handle,
            StringToAWSLocationsEnum(params.location),
            file,
            params.id
        )
    }

    return NextResponse.json({ success: true })
}
