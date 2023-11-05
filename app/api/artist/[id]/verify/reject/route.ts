import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function POST(
    req: Request,
    { params }: { params: { id: string } }
) {
    // Delete User from database
    await prisma.artistVerification.delete({
        where: {
            userId: params.id
        }
    })

    // TODO: Send a rejection email

    return NextResponse.json({
        success: true
    })
}
