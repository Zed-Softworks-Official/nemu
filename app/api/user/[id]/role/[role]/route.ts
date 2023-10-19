import { NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'
import { StringToRoleEnum } from '@/helpers/user-info'

export async function POST(req: Request, { params }: { params: { id: string, role: string }}) {
    let updated: boolean = false

    try {
        await prisma.user.update({
            where: {
                id: params.id
            },
            data: {
                role: StringToRoleEnum(params.role)
            }
        })
    } catch (e) {
        console.log(e)
    }

    return NextResponse.json({
        user_updated: updated
    })
}