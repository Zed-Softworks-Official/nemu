import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { ArtistVerificationData } from '@/core/structures'
import {
    ArtistVerificationResponse,
    NemuResponse,
    StatusCode
} from '@/core/responses'

/**
 * Gets all artists that have applied for verification
 */
export async function GET() {
    return NextResponse.json<ArtistVerificationResponse>({
        status: StatusCode.Success,
        artists: await prisma.artistVerification.findMany()
    })
}

/**
 * Called when a user applies for verification
 */
export async function POST(req: Request) {
    const verification_data: ArtistVerificationData = await req.json()

    const response = await prisma.artistVerification.create({
        data: {
            userId: verification_data.user_id,
            requestedHandle: verification_data.requested_handle,
            username: verification_data.username,
            twitter: verification_data.twitter,
            pixiv: verification_data.pixiv,
            location: verification_data.location
        }
    })

    if (!response) {
        return NextResponse.json<NemuResponse>({
            status: StatusCode.InternalError,
            message: 'Unable to create artist verification'
        })
    }

    return NextResponse.json<NemuResponse>({
        status: StatusCode.Success
    })
}
