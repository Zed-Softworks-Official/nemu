import { z } from 'zod'

import { TRPCError } from '@trpc/server'

import {
    SocialAccount,
    SocialAgent,
    UserRole,
    VerificationMethod
} from '~/core/structures'
import {
    adminProcedure,
    createTRPCRouter,
    protectedProcedure,
    publicProcedure
} from '~/server/api/trpc'
import { db } from '~/server/db'
import { StripeCreateAccount } from '~/core/payments'
import { SendbirdUserData } from '~/sendbird/sendbird-structures'
import { sendbird } from '~/server/sendbird'
import { novu } from '~/server/novu'
import { clerkClient, User } from '@clerk/nextjs/server'
import { artist_codes, artist_verifications, artists, users } from '~/server/db/schema'
import { createId } from '@paralleldrive/cuid2'
import { count, eq } from 'drizzle-orm'
import { set_index } from '~/core/search'

/**
 * Data required for verification
 */
const verification_data = z.object({
    method: z.string(),
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
export async function CreateArtist(input: VerificationDataType, user: User) {
    const social_accounts: SocialAccount[] = []

    if (input.twitter) {
        social_accounts.push({
            agent: SocialAgent.Twitter,
            url: input.twitter
        })
    }

    if (input.pixiv) {
        social_accounts.push({
            agent: SocialAgent.Pixiv,
            url: input.pixiv
        })
    }

    if (input.website) {
        social_accounts.push({
            agent: SocialAgent.Website,
            url: input.website
        })
    }

    const stripe_account = await StripeCreateAccount()

    // Create artist in the database
    const artist = (
        await db
            .insert(artists)
            .values({
                id: createId(),
                stripe_account: stripe_account.id,
                location: input.location,
                user_id: user.id,
                handle: input.requested_handle,
                socials: social_accounts
            })
            .returning()
    )[0]!

    if (!artist) {
        throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Could not create artist'
        })
    }

    // Check if the user already has a sendbird account
    if (!user.publicMetadata.has_sendbird_account) {
        // Create Sendbird user
        const user_data: SendbirdUserData = {
            user_id: user.id,
            nickname: artist.handle,
            profile_url: user.imageUrl
        }

        sendbird.CreateUser(user_data)
    }

    // Update User Metadata
    await clerkClient.users.updateUserMetadata(user.id, {
        publicMetadata: {
            has_sendbird_account: true
        },
        privateMetadata: {
            artist_id: artist.id
        }
    })

    // Update Algolia
    await set_index('artists', {
        objectID: artist.id,
        handle: artist.handle,
        about: artist.about,
        image_url: artist.header_photo
    })

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
        .mutation(async ({ input, ctx }) => {
            // Check if they're already an artist
            if (ctx.user.publicMetadata.role == UserRole.Artist) {
                return { success: false }
            }

            // Check if the handle already exists
            const artist_exists = await ctx.db.query.artists.findFirst({
                where: eq(artists.handle, input.requested_handle)
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
                case VerificationMethod.Code:
                    {
                        const artist_code = await ctx.db.query.artist_codes.findFirst({
                            where: eq(artist_codes.code, input.artist_code!)
                        })

                        if (!artist_code) {
                            throw new TRPCError({
                                message: 'Artist code does not exist',
                                code: 'INTERNAL_SERVER_ERROR'
                            })
                        }

                        // Create Artist
                        const artist = await CreateArtist(input, ctx.user)

                        // Update User Role
                        await ctx.db.update(users).set({
                            role: UserRole.Artist
                        })

                        await clerkClient.users.updateUserMetadata(ctx.user.id, {
                            publicMetadata: {
                                role: UserRole.Artist
                            }
                        })

                        // Delete Code
                        await ctx.db
                            .delete(artist_codes)
                            .where(eq(artist_codes.id, artist_code.id))

                        // Delete User Cache
                        // await ctx.cache.del(AsRedisKey('users', ctx.user.id))

                        // Notify user of status
                        await novu.trigger('sign-up-approved', {
                            to: {
                                subscriberId: ctx.user.id
                            },
                            payload: {
                                artist_handle: artist.handle
                            }
                        })
                    }
                    break
                ////////////////////////////
                // Verification by Twitter
                ////////////////////////////
                case VerificationMethod.Twitter:
                    {
                        const artist_verification = await ctx.db
                            .insert(artist_verifications)
                            .values({
                                id: createId(),
                                user_id: ctx.user.id!,
                                location: input.location,
                                requested_handle: input.requested_handle,
                                twitter: input.twitter,
                                pixiv: input.pixiv,
                                website: input.website
                            })
                            .returning()

                        if (!artist_verification) {
                            throw new TRPCError({
                                message: 'Verification object could not be created',
                                code: 'INTERNAL_SERVER_ERROR'
                            })
                        }

                        await novu.trigger('status-pending', {
                            to: {
                                subscriberId: ctx.user.id
                            },
                            payload: {}
                        })
                    }
                    break
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
        .mutation(async ({ input, ctx }) => {
            // Get Verification Object
            const artist_verification = await ctx.db.query.artist_verifications.findFirst(
                {
                    where: eq(artist_verifications.id, input.verification_id)
                }
            )

            if (!artist_verification) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Could not find artist verification'
                })
            }

            // If they're rejected, exit early
            if (!input.approved) {
                // Delete Verification Object
                await ctx.db
                    .delete(artist_verifications)
                    .where(eq(artist_verifications.id, input.verification_id))

                // Notify User that they were rejected
                await novu.trigger('sign-up-rejected', {
                    to: {
                        subscriberId: artist_verification?.user_id!
                    },
                    payload: {}
                })

                return { success: true }
            }

            // Get User Object
            const user = await clerkClient.users.getUser(artist_verification.user_id)

            // Create Artist Object
            const artist = await CreateArtist(
                {
                    method: VerificationMethod.Twitter,
                    requested_handle: artist_verification?.requested_handle!,
                    location: artist_verification?.location!,
                    pixiv: artist_verification?.pixiv || undefined,
                    twitter: artist_verification?.twitter || undefined,
                    website: artist_verification?.website || undefined
                },
                user
            )

            if (!artist) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Could not create artist'
                })
            }

            // Delete Verification Object
            await ctx.db
                .delete(artist_verifications)
                .where(eq(artist_verifications.id, input.verification_id))

            // Notify User that they were approved
            await novu.trigger('sign-up-approved', {
                to: {
                    subscriberId: artist_verification?.user_id!
                },
                payload: {
                    artist_handle: artist.handle
                }
            })

            return { success: true }
        }),

    /**
     * Checks the requested handle to make sure nobody else has requested it,
     * since we can only have one of each
     */
    handle_exists: protectedProcedure
        .input(z.string())
        .mutation(async ({ input, ctx }) => {
            // check handle inside artists
            const artist_handle_exists = await ctx.db
                .select({ count: count() })
                .from(artists)
                .where(eq(artists.handle, input))

            for (const handle of artist_handle_exists) {
                if (handle.count != 0) {
                    return { exists: true }
                }
            }

            // check handle inside of verification table
            const verification_handle_exists = await ctx.db
                .select({ count: count() })
                .from(artist_verifications)
                .where(eq(artist_verifications.requested_handle, input))

            for (const handle of verification_handle_exists) {
                if (handle.count != 0) {
                    return { exists: true }
                }
            }

            if (verification_handle_exists) {
                return { exists: true }
            }

            return { exists: false }
        }),

    /**
     * Gets an artist code form the database
     */
    get_artist_code: publicProcedure
        .input(z.string())
        .mutation(async ({ input, ctx }) => {
            const result = await ctx.db.query.artist_codes.findFirst({
                where: eq(artist_codes.code, input)
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

        const result = await ctx.db.insert(artist_codes).values({
            id: createId(),
            code: new_code
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
