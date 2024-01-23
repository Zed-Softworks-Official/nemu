import { FormElementInstance } from '@/components/form-builder/elements/form-elements'
import {
    CommissionFormsSubmissionViewResponse,
    FormResponses,
    StatusCode
} from '@/core/responses'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

/**
 *
 * @param id - userId
 */
export async function GET(
    req: Request,
    { params }: { params: { id: string; form_id: string } }
) {
    // Get the artist
    const artist = await prisma.artist.findFirst({
        where: {
            userId: params.id
        }
    })

    if (!artist) {
        return NextResponse.json<CommissionFormsSubmissionViewResponse>({
            status: StatusCode.InternalError,
            message: 'Could not find requested artist'
        })
    }

    // Get form with form submissions
    const form = await prisma.form.findFirst({
        where: {
            id: params.form_id,
            artistId: artist.id
        },
        include: {
            formSubmissions: true
        }
    })

    if (!form) {
        return NextResponse.json<CommissionFormsSubmissionViewResponse>({
            status: StatusCode.InternalError,
            message: 'Could not find requested form'
        })
    }

    // Form responses
    let responses: FormResponses[] = []
    for (const submission of form?.formSubmissions) {
        try {
            const user = await prisma.user.findFirst({
                where: {
                    id: submission.userId
                }
            })

            responses.push({
                userId: user?.id!,
                username: user?.name!,

                content: submission.content,
                createdAt: submission.createdAt
            })
        } catch (e) {
            console.log(e)
            return
        }
    }

    return NextResponse.json<CommissionFormsSubmissionViewResponse>({
        status: StatusCode.Success,

        name: form.name,
        description: form.description,
        responses: responses,

        submissions: form.submissions,
        form_labels: JSON.parse(form.content) as FormElementInstance[]
    })
}
