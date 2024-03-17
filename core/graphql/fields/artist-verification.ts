import { ArtistVerificationInputType, Role, VerificationMethod } from '@/core/structures'
import { builder } from '../builder'

import { StatusCode } from '@/core/responses'
import { ArtistCodeVerification, ArtistTwitterVerification, CreateArtist } from '@/core/verification-methods'
import { prisma } from '@/lib/prisma'
import { novu } from '@/lib/novu'

builder.mutationField('create_artist_verification', (t) =>
    t.field({
        type: 'NemuResponse',
        args: {
            verification_data: t.arg({
                type: 'ArtistVerificationInputType',
                required: true,
                description: 'Creates a new artist verification object or accepts the user if they have an artist code'
            })
        },
        resolve: async (_parent, args) => {
            // Check if the handle already exists
            const artist_exists = await prisma.artist.findFirst({
                where: {
                    handle: args.verification_data.requested_handle!
                }
            })

            if (artist_exists) {
                return {
                    status: StatusCode.InternalError,
                    message: 'Handle already exists!'
                }
            }

            // Work on the appropriate method
            switch (args.verification_data.method) {
                case VerificationMethod.Code:
                    return ArtistCodeVerification(args.verification_data as ArtistVerificationInputType)
                case VerificationMethod.Twitter:
                    return ArtistTwitterVerification(args.verification_data as ArtistVerificationInputType)
            }

            return {
                status: StatusCode.InternalError,
                message: 'Invalid verification method'
            }
        }
    })
)

builder.mutationField('update_artist_verification', (t) =>
    t.field({
        type: 'NemuResponse',
        args: {
            artist_verification_id: t.arg({
                type: 'String',
                required: true,
                description: 'The id of the artist verification'
            }),
            approved: t.arg({
                type: 'Boolean',
                required: true,
                description: 'Was the artist approved?'
            })
        },
        resolve: async (_parent, args) => {
            // Get Verification Object
            const artist_verification = await prisma.artistVerification.findFirst({
                where: {
                    id: args.artist_verification_id
                }
            })

            // Create Artist Object
            const artist = await CreateArtist({
                requested_handle: artist_verification?.requestedHandle,
                location: artist_verification?.location,
                pixiv: artist_verification?.pixiv || undefined,
                twitter: artist_verification?.twitter || undefined,
                website: artist_verification?.website || undefined,
                user_id: artist_verification?.userId,
                username: artist_verification?.username
            })

            // Delete Verification Object
            await prisma.artistVerification.delete({
                where: {
                    id: artist_verification?.id
                }
            })

            // Notify User
            novu.trigger('artist-verification', {
                to: {
                    subscriberId: args.artist_verification_id
                },
                payload: {
                    method: 'result',
                    intro_message: args.approved ? `Congratulations ${artist.handle}!` : 'Oh Nyo!',
                    status: args.approved ? 'approved' : 'rejected'
                }
            })

            return {
                status: StatusCode.Success
            }
        }
    })
)
