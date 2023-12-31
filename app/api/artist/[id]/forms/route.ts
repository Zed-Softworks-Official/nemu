import { NextResponse } from 'next/server'
import { NemuResponse, StatusCode } from '@/helpers/api/request-inerfaces'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request, { params }: { params: { id: string } }) {
    const formData = await req.formData()

    const user = await prisma.user.findFirst({
        where: {
            id: params.id
        },
        include: {
            artist: true
        }
    })

    return NextResponse.json<NemuResponse>({
        status: StatusCode.Success,
    })
}
