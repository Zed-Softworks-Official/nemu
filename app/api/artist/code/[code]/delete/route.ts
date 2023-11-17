import { NemuResponse, StatusCode } from '@/helpers/api/request-inerfaces'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function POST(req: Request, { params }: { params: { code: string } }) {
    const result = await prisma.aritstCode.findFirst({
        where: {
            code: params.code
        }
    })

    await prisma.aritstCode.delete({
        where: {
            id: result?.id
        }
    })

    return NextResponse.json<NemuResponse>({
        status: StatusCode.Success
    })
}
