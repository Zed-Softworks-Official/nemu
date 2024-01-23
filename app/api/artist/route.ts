import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

import { ArtistVerificationData } from '@/core/structures'
import { NemuResponse, StatusCode } from '@/core/responses'

export async function POST(req: Request) {
    const verification_data: ArtistVerificationData = await req.json()

    const new_artist = await prisma.user.update({
        where: {
            id: verification_data.user_id
        },
        data: {
            artist: {
                create: {
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
            }
        }
    })

    if (!new_artist) {
        return NextResponse.json<NemuResponse>({
            status: StatusCode.InternalError,
            message: 'Could not create artist!'
        })
    }

    return NextResponse.json<NemuResponse>({
        status: StatusCode.Success
    })
}
