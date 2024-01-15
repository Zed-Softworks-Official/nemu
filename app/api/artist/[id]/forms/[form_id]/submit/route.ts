import { NextResponse } from 'next/server'
import { NemuResponse, StatusCode } from '@/helpers/api/request-inerfaces'
import { prisma } from '@/lib/prisma'

export async function POST(
    req: Request,
    { params }: { params: { id: string; form_id: string } }
) {
    // TODO: Create Stripe authorization charge so that the artist can choose whether or not to charge them

    // TODO: Remove this and move to stripe hooks
    const data = await req.json()
    const userId = data['user_id']

    // Remove UserId
    delete data['user_id']

    try {
        await prisma.form.update({
            where: {
                id: params.form_id
            },
            data: {
                submissions: {
                    increment: 1
                },
                formSubmissions: {
                    create: {
                        content: JSON.stringify(data),
                        userId: userId
                    }
                }
            }
        })
    } catch (e) {
        console.log(e)

        return NextResponse.json<NemuResponse>({
            status: StatusCode.InternalError,
            message: 'An Error has occured!'
        })
    }

    return NextResponse.json<NemuResponse>({
        status: StatusCode.Success
    })
}
