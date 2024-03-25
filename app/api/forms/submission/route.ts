import { CommissionStatus, CreateFormSubmissionStructure } from '@/core/data-structures/form-structures'
import { UpdateCommissionAvailability } from '@/core/helpers'
import { NemuResponse, StatusCode } from '@/core/responses'
import { CommissionAvailability } from '@/core/structures'
import { novu } from '@/lib/novu'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

/**
 * Creates a new form submission for someone that submitted an INVOICE style Commission
 * Still needs to be reviewed by artist to accept it
 */
export async function POST(req: Request) {
    const data = (await req.json()) as CreateFormSubmissionStructure

    const form_submission = await prisma.formSubmission.create({
        data: {
            userId: data.user_id,
            formId: data.form_id,
            content: data.content,
            orderId: crypto.randomUUID()
        },
        include: {
            form: {
                include: {
                    commission: {
                        include: {
                            artist: true
                        }
                    }
                }
            },
            user: {
                include: {
                    artist: true
                }
            }
        }
    })

    if (!form_submission) {
        return NextResponse.json<NemuResponse>({
            status: StatusCode.InternalError,
            message: 'Failed to create form submission'
        })
    }

    // Update Commission Availability
    await UpdateCommissionAvailability(data.form_id)

    // Update form values
    await prisma.form.update({
        where: {
            id: data.form_id
        },
        data: {
            submissions: {
                increment: 1
            },
            newSubmissions: {
                increment: 1
            }
        }
    })

    const user = await prisma.user.findFirst({
        where: {
            id: data.user_id
        }
    })

    // Add the user to the waitlist if they're waitlisted
    await prisma.formSubmission.update({
        where: {
            id: form_submission.id
        },
        data: {
            waitlist: form_submission.form.commission?.availability == CommissionAvailability.Waitlist ? true : false
        }
    })

    // Notify artist of commission
    novu.trigger('commission-request', {
        to: {
            subscriberId: form_submission.form.commission?.artist.userId!
        },
        payload: {
            username: user?.name!,
            commission_name: form_submission.form.commission?.title,
            slug: form_submission.form.commission?.slug
        }
    })

    return NextResponse.json<NemuResponse>({
        status: StatusCode.Success
    })
}
