import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

import { NemuResponse, StatusCode } from '@/helpers/api/request-inerfaces'

export async function GET(req: Request, { params }: { params: { username: string } }) {
    let status = StatusCode.Success
    let message = ''

    // Check if the user already exists
    const user = await prisma.user.findFirst({
        where: {
            name: params.username
        }
    })

    if (user) {
        status = StatusCode.InternalError
        message = 'Looks like that username exists already!'
    }

    return NextResponse.json<NemuResponse>({
        status: status,
        message: message
    })
}

export async function POST(req: Request, { params }: { params: { username: string } }) {
    let status = StatusCode.Success
    let message = ''

    const json = await req.json()

    try {
        await prisma.user.update({
            where: {
                id: json.current_user
            },
            data: {
                name: params.username
            }
        })
    } catch (e) {
        console.log(e)

        status = StatusCode.InternalError
        message = "Couldn't set username"
    }

    return NextResponse.json<NemuResponse>({
        status: status,
        message: message
    })
}
