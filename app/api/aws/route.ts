import { getServerAuthSession } from '@/core/auth'
import { StatusCode } from '@/core/responses'
import { S3Upload } from '@/core/storage'
import { FileUploadData, UploadResponse } from '@/core/structures'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Uploads a file to AWS S3
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

    // Upload to S3
    for (const file of files) {
        await S3Upload(file, JSON.parse(data.get(file.name) as string) as FileUploadData)
    }

    // Update database for route

    return NextResponse.json<UploadResponse>({
        status: StatusCode.Success
    })
}
