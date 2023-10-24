import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function GET(req: Request, { params }: { params: { id: string }}) {
    let user = await prisma.user.findFirst({
        where: {
            id: params.id
        }
    })

    return NextResponse.json({
        info: user
    })
}