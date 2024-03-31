import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { novu } from '@/lib/novu'
import { adminProcedure, createTRPCRouter, protectedProcedure } from '../trpc'
import { Role, VerificationMethod } from '@/core/structures'
import { CreateArtist } from '@/core/server-helpers'
import { TRPCError } from '@trpc/server'

const verification_data = z.object({
    method: z.number(),
    requested_handle: z.string(),
    username: z.string(),
    twitter: z.string().optional(),
    pixiv: z.string().optional(),
    website: z.string().optional(),
    location: z.string(),
    artist_code: z.string().optional()
})

export const verificationRouter = createTRPCRouter({
    /**
     * Artist Verification endpoint
     *
     * Called when a user is requesting to be verified
     *
     * If the user provided an artist code and the code is valid
     * they will then become an artist with the information they provided
     *
     * otherwise an ArtistVerification Object will be created in the database
     * for an admin to review it later
     */
    set_verification: protectedProcedure
        .input(verification_data)
        .mutation(async (opts) => {
            const { input, ctx } = opts

            // Check if they're already an artist
            if (ctx.session.user.role == Role.Artist) {
                return { success: false }
            }

            // Check if the handle already exists
            const artist_exists = await prisma.artist.findFirst({
                where: {
                    handle: input.requested_handle
                }
            })

            if (artist_exists) {
                return { success: false }
            }

            // Work on the appropriate method
            switch (input.method) {
                ////////////////////////////
                // Verification by Code
                ////////////////////////////
                case VerificationMethod.Code: {
                    const artist_code = await prisma.aritstCode.findFirst({
                        where: {
                            code: input.artist_code!
                        }
                    })

                    if (!artist_code) {
                        return { success: false }
                    }

                    // Create Artist
                    const artist = await CreateArtist(input, ctx.session.user.user_id!)

                    // Update User Role
                    await prisma.user.update({
                        where: {
                            id: ctx.session.user.user_id!
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
                            subscriberId: ctx.session.user.user_id!
                        },
                        payload: {
                            result: true,
                            intro_message: `Congratulations ${artist.handle}!`,
                            status: 'accepted'
                        }
                    })
                }
                ////////////////////////////
                // Verification by Twitter
                ////////////////////////////
                case VerificationMethod.Twitter: {
                    const artistVerification = await prisma.artistVerification.create({
                        data: {
                            userId: ctx.session.user.user_id!,
                            username: input.username,
                            location: input.location,
                            requestedHandle: input.requested_handle,
                            twitter: input.twitter,
                            pixiv: input.pixiv,
                            website: input.website
                        }
                    })

                    if (!artistVerification) {
                        return { success: false }
                    }

                    novu.trigger('artist-verification-submit', {
                        to: {
                            subscriberId: ctx.session.user.user_id!
                        },
                        payload: {
                            method: 'Twitter'
                        }
                    })
                }
            }

            return { success: true }
        }),

    /**
     * Verifies a specific user to become an artist
     */
    verify_user: adminProcedure
        .input(
            z.object({
                approved: z.boolean(),
                verification_id: z.string()
            })
        )
        .mutation(async (opts) => {
            const { input } = opts

            // Get Verification Object
            const artist_verification = await prisma.artistVerification.findFirst({
                where: {
                    id: input.verification_id
                }
            })

            if (!artist_verification) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Could not find artist verification'
                })
            }

            // Create Artist Object
            const artist = await CreateArtist(
                {
                    method: VerificationMethod.Twitter,
                    requested_handle: artist_verification?.requestedHandle!,
                    location: artist_verification?.location!,
                    pixiv: artist_verification?.pixiv || undefined,
                    twitter: artist_verification?.twitter || undefined,
                    website: artist_verification?.website || undefined,
                    username: artist_verification?.username!
                },
                artist_verification?.userId!
            )

            if (!artist) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Could not create artist'
                })
            }

            // Delete Verification Object
            await prisma.artistVerification.delete({
                where: {
                    id: artist_verification?.id
                }
            })

            // Notify User
            novu.trigger('artist-verification', {
                to: {
                    subscriberId: artist_verification?.userId!
                },
                payload: {
                    method: 'result',
                    intro_message: input.approved
                        ? `Congratulations ${artist.handle}!`
                        : 'Oh Nyo!',
                    status: input.approved ? 'approved' : 'rejected'
                }
            })

            return { success: true }
        })
})
