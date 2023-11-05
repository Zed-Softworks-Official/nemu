import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function POST(
    req: Request,
    { params }: { params: { id: string } }
) {
    // Get the artist from the verification section
    let verify_info = await prisma.artistVerification.findFirst({
        where: {
            userId: params.id
        }
    })

    // Create a new artist in the database
    await prisma.artist.create({
        data: {
            userId: params.id,
            stripeAccId: '',
            
            handle: verify_info?.requestedHandle!,
            about: 'Peko Peko',
            location: verify_info?.location!,
            store: false,
            twitter: verify_info?.twitter!,
            pixiv: verify_info?.pixiv!,
            website: '',
            terms: 'Pls Feed Nemu',

            headerPhoto: '',
            profilePhoto: ''
        }
    })

    // Send the approved email

    // Delete the Artist Verification Object
    await prisma.artistVerification.delete({
        where: {
            id: verify_info?.id
        }
    })

    // TODO: Update Search Database

    return NextResponse.json({
        success: true
    })
}
