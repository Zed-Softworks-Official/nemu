import { z } from 'zod'

import { TRPCError } from '@trpc/server'

import { UserRole, VerificationMethod } from '~/core/structures'
import {
    adminProcedure,
    createTRPCRouter,
    protectedProcedure,
    publicProcedure
} from '~/server/api/trpc'
import { AsRedisKey } from '~/server/cache'
import { db } from '~/server/db'
import { env } from '~/env'
import { StripeCreateAccount } from '~/core/payments'
import { Prisma } from '@prisma/client'
import { SendbirdUserData } from '~/sendbird/sendbird-structures'
import { sendbird } from '~/server/sendbird'
import { novu } from '~/server/novu'

/**
 * Data required for verification
 */
const verification_data = z.object({
    method: z.number(),
    requested_handle: z.string(),
    twitter: z.string().optional(),
    pixiv: z.string().optional(),
    website: z.string().optional(),
    location: z.string(),
    artist_code: z.string().optional(),
    username: z.string().optional()
})

type VerificationDataType = z.infer<typeof verification_data>

/**
 * Helper function that creates an artist
 */
export async function CreateArtist(input: VerificationDataType, user_id: string) {
    const socials: Prisma.SocialCreateWithoutArtistInput[] = []

    if (input.twitter) {
        socials.push({
            agent: 'TWITTER',
            url: input.twitter
        })
    }

    if (input.pixiv) {
        socials.push({
            agent: 'PIXIV',
            url: input.pixiv
        })
    }

    if (input.website) {
        socials.push({
            agent: 'WEBSITE',
            url: input.website
        })
    }

    const stripe_account = await StripeCreateAccount()

    // Create Artist inside database
    const artist = await db.artist.create({
        data: {
            stripeAccount: stripe_account.id,
            userId: user_id,
            handle: input.requested_handle!,
            socials: {
                createMany: {
                    data: socials
                }
            }
        },
        include: {
            user: true
        }
    })

    if (!artist) {
        throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Could not create artist'
        })
    }

    // Check if the user already has a sendbird account
    if (!artist.user?.hasSendbirdAccount) {
        // Create Sendbird user
        const user_data: SendbirdUserData = {
            user_id: user_id,
            nickname: artist.handle,
            profile_url: artist.user.image
                ? artist.user.image
                : `${env.NEXTAUTH_URL}/profile.png`
        }

        sendbird.CreateUser(user_data)

        // Update database
        await db.user.update({
            where: {
                id: user_id
            },
            data: {
                hasSendbirdAccount: true
            }
        })
    }

    return artist
}

/**
 * The Actual Vrification Router
 */
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
            if (ctx.session.user.role == UserRole.Artist) {
                return { success: false }
            }

            // Check if the handle already exists
            const artist_exists = await ctx.db.artist.findFirst({
                where: {
                    handle: input.requested_handle
                }
            })

            if (artist_exists) {
                throw new TRPCError({
                    message: 'Artist already Exists',
                    code: 'INTERNAL_SERVER_ERROR'
                })
            }

            // Work on the appropriate method
            switch (input.method) {
                ////////////////////////////
                // Verification by Code
                ////////////////////////////
                case VerificationMethod.Code: {
                    const artist_code = await ctx.db.aritstCode.findFirst({
                        where: {
                            code: input.artist_code!
                        }
                    })

                    if (!artist_code) {
                        throw new TRPCError({
                            message: 'Artist code does not exist',
                            code: 'INTERNAL_SERVER_ERROR'
                        })
                    }

                    // Create Artist
                    const artist = await CreateArtist(input, ctx.session.user.id!)

                    // Update User Role
                    await ctx.db.user.update({
                        where: {
                            id: ctx.session.user.id!
                        },
                        data: {
                            role: UserRole.Artist
                        }
                    })

                    // Delete Code
                    await ctx.db.aritstCode.delete({
                        where: {
                            id: artist_code.id
                        }
                    })

                    // Delete User Cache
                    await ctx.cache.del(AsRedisKey('users', ctx.session.user.id!))

                    // Notify user of status
                    novu.trigger('artist-verification', {
                        to: {
                            subscriberId: ctx.session.user.id!
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
                    const artistVerification = await ctx.db.artistVerification.create({
                        data: {
                            userId: ctx.session.user.id!,
                            username: ctx.session.user.name!,
                            location: input.location,
                            requestedHandle: input.requested_handle,
                            twitter: input.twitter,
                            pixiv: input.pixiv,
                            website: input.website
                        }
                    })

                    if (!artistVerification) {
                        throw new TRPCError({
                            message: 'Verification object could not be created',
                            code: 'INTERNAL_SERVER_ERROR'
                        })
                    }

                    novu.trigger('artist-verification-submit', {
                        to: {
                            subscriberId: ctx.session.user.id!
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
            const { input, ctx } = opts

            // Get Verification Object
            const artist_verification = await ctx.db.artistVerification.findFirst({
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
            await ctx.db.artistVerification.delete({
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
        }),

    /**
     * Checks the requested handle to make sure nobody else has requested it,
     * since we can only have one of each
     */
    handle_exists: protectedProcedure.input(z.string()).mutation(async (opts) => {
        const { input, ctx } = opts

        // check handle inside artists
        const artist_handle_exists = await ctx.db.artist.findFirst({
            where: {
                handle: input
            }
        })

        if (artist_handle_exists) {
            return { exists: true }
        }

        // check handle inside of verification table
        const verification_handle_exists = await ctx.db.artistVerification.findFirst({
            where: {
                requestedHandle: input
            }
        })

        if (verification_handle_exists) {
            return { exists: true }
        }

        return { exists: false }
    }),

    /**
     * Gets an artist code form the database
     */
    get_artist_code: publicProcedure.input(z.string()).mutation(async (opts) => {
        const { input, ctx } = opts

        const result = await ctx.db.aritstCode.findFirst({
            where: {
                code: input
            }
        })

        if (!result) {
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
        }

        return { success: true }
    }),

    /**
     * Creates an artist code to add to the database
     */
    set_artist_code: adminProcedure.mutation(async (opts) => {
        const { ctx } = opts

        const new_code = 'NEMU-' + crypto.randomUUID()

        const result = await ctx.db.aritstCode.create({
            data: {
                code: new_code
            }
        })

        if (!result) {
            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Could not generate artist code!'
            })
        }

        return { generated_code: new_code }
    })
})
