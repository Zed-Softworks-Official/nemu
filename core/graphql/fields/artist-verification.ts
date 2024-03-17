import { ArtistVerificationInputType, Role, VerificationMethod } from '@/core/structures'
import { builder } from '../builder'

import { StatusCode } from '@/core/responses'
import { ArtistCodeVerification, ArtistTwitterVerification } from '@/core/verification-methods'
import { prisma } from '@/lib/prisma'

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
