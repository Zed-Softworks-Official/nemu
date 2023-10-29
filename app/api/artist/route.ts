import { ArtistVerificationData } from "@/helpers/artist-verification";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
    const verification_data: ArtistVerificationData = await req.json()
    let user_created: boolean = false

    try {
        await prisma.artist.create({
            data: {
                userId: verification_data.user_id,
                stripeAccId: '',
                
                handle: verification_data.requested_handle,
                about: 'Peko Peko',
                location: verification_data.location == '' ? 'Nemu\'s Basment' : verification_data.location,
                twitter: verification_data.twitter,
                pixiv: verification_data.pixiv,
                website: '',
                headerPhoto: '',
                profilePhoto: ''
            }
        })

        user_created = true
    } catch (e) {
        console.log(e)
    }

    return NextResponse.json({
        user_created
    })
}