import { NextResponse } from 'next/server'
import { CommissionFormsResponse, NemuResponse, StatusCode } from '@/helpers/api/request-inerfaces'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request, { params }: { params: { id: string } }) {
    const formData = await req.formData()

    // Get the user
    const user = await prisma.user.findFirst({
        where: {
            id: params.id
        },
        include: {
            artist: true
        }
    })

    // Create Form
    const form = await prisma.form.create({
        data: {
            artistId: user?.artist?.id!,
            commissionId: '',

            name: formData.get('commission_form_name') as string,
            description: formData.get('commission_form_desc') as string
        }
    })

    if (!form) {
        return NextResponse.json<NemuResponse>({
            status: StatusCode.InternalError,
            message: 'Form could not be created!'
        })
    }

    return NextResponse.json<NemuResponse>({
        status: StatusCode.Success
    })
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
    const user = await prisma.user.findFirst({
        where: {
            id: params.id
        },
        include: {
            artist: {
                include: {
                    forms: true
                }
            }
        }
    })

    return NextResponse.json<CommissionFormsResponse>({
        status: StatusCode.Success,
        forms: user?.artist?.forms
    })
}
