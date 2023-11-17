import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { NemuResponse, StatusCode } from '@/helpers/api/request-inerfaces'

export async function POST(req: Request, { params }: { params: { code: string } }) {
    const result = await prisma.aritstCode.findFirst({
        where: {
            code: params.code
        }
    })

    if (!result) {
        return NextResponse.json<NemuResponse>({
            status: StatusCode.InternalError,
            message: 'Failed to find artist code!'
        })
    }

    return NextResponse.json<NemuResponse>({
        status: StatusCode.Success
    })
}