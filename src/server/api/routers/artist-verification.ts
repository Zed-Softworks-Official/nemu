import { z } from 'zod'
import { adminProcedure, createTRPCRouter } from '../trpc'
import { clerkClient } from '@clerk/nextjs/server'
import { revalidateTag } from 'next/cache'
import { createId } from '@paralleldrive/cuid2'

import {
    type NemuPublicUserMetadata,
    type SocialAccount,
    SocialAgent,
    type VerificationDataType,
    VerificationMethod
} from '~/lib/structures'

import { artist_codes, artist_verifications, artists } from '~/server/db/schema'
import { TRPCError } from '@trpc/server'
import { db } from '~/server/db'
import { eq } from 'drizzle-orm'
import { StripeCreateAccount } from '~/lib/payments'

import { set_index } from '~/server/algolia/collections'
import { send_notification, KnockWorkflows } from '~/server/knock'

export const artist_verification_router = createTRPCRouter({
    generate_artist_code: adminProcedure
        .input(
            z.object({
                amount: z.number().min(1).max(100)
            })
        )
        .mutation(async ({ input, ctx }) => {
            // Create the new artist codes
            const codes = Array.from({ length: input.amount }, () => ({
                id: createId(),
                code: 'NEMU-' + crypto.randomUUID()
            }))

            // Batch insert all codes in a single database operation
            await ctx.db.insert(artist_codes).values(codes)

            // Extract just the code strings for the result
            const result = codes.map((code) => code.code)

            revalidateTag('artist_codes')

            return { success: true, codes: result }
        }),

    get_artist_codes: adminProcedure.query(async ({ ctx }) => {
        return await ctx.db.query.artist_codes.findMany()
    }),

    get_artist_verifications: adminProcedure.query(async ({ ctx }) => {
        return await ctx.db.query.artist_verifications.findMany()
    }),

    verify_artist: adminProcedure
        .input(
            z.object({
                requested_handle: z.string(),
                twitter: z.string().url().optional(),
                website: z.string().url().optional(),
                location: z.string().optional(),
                method: z.enum([VerificationMethod.Code, VerificationMethod.Twitter]),
                artist_code: z.string().optional()
            })
        )
        .mutation(async ({ input, ctx }) => {
            switch (input.method) {
                case VerificationMethod.Code:
                    {
                        if (!input.artist_code) {
                            throw new TRPCError({
                                code: 'BAD_REQUEST',
                                message: 'Artist code is required'
                            })
                        }

                        // Check if the artist code exists
                        const artist_code = await db.query.artist_codes.findFirst({
                            where: eq(artist_codes.code, input.artist_code)
                        })

                        if (!artist_code) {
                            throw new TRPCError({
                                code: 'BAD_REQUEST',
                                message: 'Artist code does not exist'
                            })
                        }

                        const db_promise = create_artist(
                            {
                                requested_handle: input.requested_handle,
                                twitter: input.twitter ?? '',
                                website: input.website ?? '',
                                location: input.location ?? '',
                                method: VerificationMethod.Code,
                                artist_code: input.artist_code
                            },
                            ctx.auth.userId
                        )

                        // Notify the user that they've been approved
                        const knock_promise = send_notification({
                            type: KnockWorkflows.VerificationApproved,
                            recipients: [ctx.auth.userId],
                            data: {
                                artist_handle: input.requested_handle
                            }
                        })

                        // Delete artist code
                        const delete_promise = db
                            .delete(artist_codes)
                            .where(eq(artist_codes.code, input.artist_code))

                        await Promise.all([db_promise, knock_promise, delete_promise])
                    }
                    break
                case VerificationMethod.Twitter:
                    {
                        // Create the artist verification object in the db
                        const db_promise = db.insert(artist_verifications).values({
                            id: createId(),
                            user_id: ctx.auth.userId,
                            requested_handle: input.requested_handle,
                            location: input.location ?? '',
                            twitter: input.twitter ?? '',
                            website: input.website ?? ''
                        })

                        // Notify the user of the request
                        const knock_promise = send_notification({
                            type: KnockWorkflows.VerificationPending,
                            recipients: [ctx.auth.userId],
                            data: undefined
                        })

                        await Promise.all([db_promise, knock_promise])
                    }
                    break
            }

            return {
                route:
                    input.method === VerificationMethod.Code
                        ? '/artists/apply/success'
                        : '/artists/apply/further-steps'
            }
        })
})

async function create_artist(input: VerificationDataType, user_id: string) {
    const social_accounts: SocialAccount[] = []
    const clerk_client = await clerkClient()

    if (input.twitter) {
        social_accounts.push({
            agent: SocialAgent.Twitter,
            url: input.twitter
        })
    }

    if (input.website) {
        social_accounts.push({
            agent: SocialAgent.Website,
            url: input.website
        })
    }

    // Get the user from the database
    const user = await clerk_client.users.getUser(user_id)
    if (!user) {
        throw new Error('User could not be found!')
    }

    // Create Stripe Account for artist
    const generated_stripe_account = await StripeCreateAccount()

    // Gnerate the artist's id'
    const generated_id = createId()

    // Create the artist in the database
    await db.insert(artists).values({
        id: generated_id,
        stripe_account: generated_stripe_account.id,
        location: input.location,
        user_id: user.id,
        handle: input.requested_handle,
        socials: social_accounts
    })

    const artist = await db.query.artists.findFirst({
        where: eq(artists.id, generated_id)
    })

    if (!artist) {
        throw new Error('Artist could not be created!')
    }

    // Update the user in clerk
    const clerk_promise = clerk_client.users.updateUserMetadata(user.id, {
        publicMetadata: {
            handle: artist.handle,
            role: 'artist',
            artist_id: artist.id
        } satisfies NemuPublicUserMetadata,
        privateMetadata: {
            artist_id: artist.id
        }
    })

    // Update Algolia
    const algolia_promise = set_index('artists', {
        objectID: artist.id,
        handle: artist.handle,
        about: artist.about,
        image_url: user.imageUrl
    })

    await Promise.all([clerk_promise, algolia_promise])

    return artist
}
