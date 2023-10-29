import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { ArtistVerificationData } from '@/helpers/artist-verification'

export async function POST(req: Request) {
    const verification_data: ArtistVerificationData = await req.json()

    try {
        await prisma.artistVerification.create({
            data: {
                userId: verification_data.user_id,
                requestedHandle: verification_data.requested_handle,
                username: verification_data.username,
                twitter: verification_data.twitter,
                pixiv: verification_data.pixiv,
                location: verification_data.location
            }
        })

    } catch (e) {
        console.log(e)
    }

    return NextResponse.json({
        success: true
    })
}