import { S3Upload } from '@/core/storage'
import { getServerAuthSession } from '@/core/auth'

import { NextRequest, NextResponse } from 'next/server'
import { FileUploadData, UploadResponse } from '@/core/structures'

/**
 * Uploads files to AWS S3
 *
 * @param req - General Request Object
 * @returns
 */
export async function POST(req: NextRequest) {
    // Check to see the reqeust is coming from a user
    const session = await getServerAuthSession()

    if (!session) {
        return NextResponse.error()
    }

    // Retrieve data
    const data = await req.formData()
    const files = (await data.getAll('files')) as unknown as File[]

    // Sort the featured image
    if (files.length > 1) {
        console.log('something goes here')
    }

    // Upload files
    for (const file of files) {
        const metadata = JSON.parse(data.get(file.name) as string) as FileUploadData

        // Upload to S3
        await S3Upload(file, metadata)
    }

    return NextResponse.json<UploadResponse>({})
}
