import { NemuResponse, StatusCode } from '@/core/responses'
import { S3Delete, S3Upload } from '@/core/storage'
import { AWSFileModification, AWSMoficiation, StringToAWSLocationsEnum } from '@/core/structures'
import { NextResponse } from 'next/server'

export async function POST(req: Request, { params }: { params: { artist_id: string; location: string } }) {
    const aws_data = await req.formData()
    // const commission_id = aws_data.get('commission_id') as string | null
    // const product_id = aws_data.get('product_id') as string | null
    const old_featured_key = aws_data.get('old_featured_key') as string
    const additional_files = JSON.parse(aws_data.get('additional_files') as string) as AWSFileModification[]

    // Check if the featured images was updated
    let featured_image_key: string | undefined = undefined
    if (aws_data.get('featured_image')) {
        // Delete the old one
        // TODO: Make is so we don't just assume the first image is featured (even though it will be it's bad)
        await S3Delete(params.artist_id, StringToAWSLocationsEnum(params.location), old_featured_key)

        featured_image_key = aws_data.get('featured_image_key') as string
        // Upload the new one
        await S3Upload(params.artist_id, StringToAWSLocationsEnum(params.location), aws_data.get('featured_image') as unknown as File, featured_image_key)
    }

    // Check if the additional files were updated
    // TODO: Figure out why this is causing an error
    const new_additional_file_keys: string[] = []
    for (let i = 1; i < additional_files.length; i++) {
        // check if it was removed then remove it from aws
        if (additional_files[i].modification == AWSMoficiation.Removed) {
            await S3Delete(params.artist_id, additional_files[i].aws_location, additional_files[i].file_key)
        } else {
            // Add it to the new file keys since it should exist by the end of this
            if (!additional_files[i].featured) {
                new_additional_file_keys.push(additional_files[i].file_key)
            }
        }

        // Check if it was added and upload it to aws
        if (additional_files[i].modification == AWSMoficiation.Added) {
            await S3Upload(
                params.artist_id,
                additional_files[i].aws_location,
                aws_data.get(`file-${additional_files[i].file_key}`) as unknown as File,
                additional_files[i].file_key
            )
        }
    }

    // if (commission_id) {
    //     // Update the database
    //     await prisma.commission.update({
    //         where: {
    //             id: commission_id
    //         },
    //         data: {
    //             featuredImage: featured_image_key,
    //             additionalImages: new_additional_file_keys.length != 0 ? new_additional_file_keys : undefined
    //         }
    //     })
    // }

    return NextResponse.json<NemuResponse>({
        status: StatusCode.Success
    })
}
