import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { NemuResponse, StatusCode } from '@/core/responses'

export async function POST(req: Request, { params }: { params: { id: string } }) {
    // Delete User from database
    await prisma.artistVerification.delete({
        where: {
            userId: params.id
        }
    })

    // TODO: Send a rejection email

    return NextResponse.json<NemuResponse>({
        status: StatusCode.Success
    })
}
