import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

import { ArtistVerificationData } from '@/helpers/artist-verification'
import { NemuResponse, StatusCode } from '@/helpers/api/request-inerfaces'

export async function POST(req: Request) {
    const verification_data: ArtistVerificationData = await req.json()

    const new_user = await prisma.artist.create({
        data: {
            userId: verification_data.user_id,
            stripeAccId: '',

            handle: verification_data.requested_handle,
            about: 'Peko Peko',
            location:
                verification_data.location == ''
                    ? "Nemu's Basment"
                    : verification_data.location,
            twitter: verification_data.twitter,
            pixiv: verification_data.pixiv,
            website: '',
            headerPhoto: '',
            profilePhoto: ''
        }
    })

    if (!new_user) {
        return NextResponse.json<NemuResponse>({
            status: StatusCode.InternalError,
            message: 'Could not create user!'
        })
    }

    return NextResponse.json<NemuResponse>({
        status: StatusCode.Success
    })
}
