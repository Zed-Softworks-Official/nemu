import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

import { StringToRoleEnum } from '@/helpers/user-info'
import { NemuResponse, StatusCode } from '@/core/responses'

export async function POST(
    req: Request,
    { params }: { params: { id: string; role: string } }
) {
    await prisma.user.update({
        where: {
            id: params.id
        },
        data: {
            role: StringToRoleEnum(params.role)
        }
    })

    return NextResponse.json<NemuResponse>({
        status: StatusCode.Success
    })
}
