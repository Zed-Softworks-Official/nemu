import { prisma } from '@/lib/prisma'
import { NemuResponse, StatusCode } from './responses'
import { ArtistVerificationInputType, Role } from './structures'
import { Prisma } from '@prisma/client'
import { novu } from '@/lib/novu'

export async function CreateArtist(verification_data: ArtistVerificationInputType) {
    const socials: Prisma.SocialCreateWithoutArtistInput[] = []

    if (verification_data.twitter) {
        socials.push({
            agent: 'TWITTER',
            url: verification_data.twitter
        })
    }

    if (verification_data.pixiv) {
        socials.push({
            agent: 'PIXIV',
            url: verification_data.pixiv
        })
    }

    if (verification_data.website) {
        socials.push({
            agent: 'WEBSITE',
            url: verification_data.website
        })
    }

    // Create Artist inside database
    return await prisma.artist.create({
        data: {
            stripeAccount: '',
            userId: verification_data.user_id!,
            handle: verification_data.requested_handle!,
            socials: {
                createMany: {
                    data: socials
                }
            }
        }
    })
}

export async function ArtistCodeVerification(verification_data: ArtistVerificationInputType): Promise<NemuResponse> {
    // Check if code exists
    const artist_code = await prisma.aritstCode.findFirst({
        where: {
            code: verification_data.artist_code!
        }
    })

    if (!artist_code) {
        return {
            status: StatusCode.InternalError,
            message: 'Artist code does not exist'
        }
    }

    // Create Artist
    const artist = await CreateArtist(verification_data)

    if (!artist) {
        return {
            status: StatusCode.InternalError,
            message: 'Unable to create artist'
        }
    }

    // Update User Role
    await prisma.user.update({
        where: {
            id: verification_data.user_id!
        },
        data: {
            role: Role.Artist
        }
    })

    // Delete Code
    await prisma.aritstCode.delete({
        where: {
            id: artist_code.id
        }
    })

    // Notify user of status
    novu.trigger('artist-verification', {
        to: {
            subscriberId: verification_data.user_id!
        },
        payload: {
            result: true,
            intro_message: `Congratulations ${artist.handle}!`,
            status: 'accepted'
        }
    })

    return {
        status: StatusCode.Success
    }
}

export async function ArtistTwitterVerification(verification_data: ArtistVerificationInputType): Promise<NemuResponse> {
    const artistVerification = await prisma.artistVerification.create({
        data: {
            userId: verification_data.user_id!,
            username: verification_data.username!,
            location: verification_data.location!,
            requestedHandle: verification_data.requested_handle!,
            twitter: verification_data.twitter,
            pixiv: verification_data.pixiv,
            website: verification_data.website
        }
    })

    if (!artistVerification) {
        return {
            status: StatusCode.InternalError,
            message: 'Could not create artist verification'
        }
    }

    novu.trigger('artist-verification-submit', {
        to: {
            subscriberId: verification_data.user_id!
        },
        payload: {
            method: 'Twitter'
        }
    })

    return {
        status: StatusCode.Success
    }
}
