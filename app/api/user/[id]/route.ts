import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

import { StatusCode, UserResponse } from '@/helpers/api/request-inerfaces'

export async function GET(req: Request, { params }: { params: { id: string } }) {
    const user = await prisma.user.findFirst({
        where: {
            id: params.id
        }
    })

    return NextResponse.json<UserResponse>({
        status: StatusCode.Success,
        info: user
    })
}
