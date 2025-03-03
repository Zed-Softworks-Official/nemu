import { z } from 'zod'
import { clerkClient } from '@clerk/nextjs/server'
import { revalidateTag } from 'next/cache'
import { createId } from '@paralleldrive/cuid2'

import { adminProcedure, createTRPCRouter, protectedProcedure } from '~/server/api/trpc'

import {
    type NemuPublicUserMetadata,
    type SocialAccount,
    type VerificationDataType,
    verificationMethods
} from '~/lib/types'

import { artistCodes, artistVerifications, artists, conSignUp } from '~/server/db/schema'
import { TRPCError } from '@trpc/server'
import { db } from '~/server/db'
import { eq } from 'drizzle-orm'
import { StripeCreateAccount } from '~/lib/payments'

import { setIndex } from '~/server/algolia/collections'
import { sendNotification, KnockWorkflows } from '~/server/knock'

export const artistVerificationRouter = createTRPCRouter({
    generateArtistCode: adminProcedure
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
            await ctx.db.insert(artistCodes).values(codes)

            // Extract just the code strings for the result
            const result = codes.map((code) => code.code)

            revalidateTag('artist_codes')

            return { success: true, codes: result }
        }),

    getArtistCodes: adminProcedure.query(async ({ ctx }) => {
        return await ctx.db.query.artistCodes.findMany()
    }),

    getArtistVerifications: adminProcedure.query(async ({ ctx }) => {
        return await ctx.db.query.artistVerifications.findMany()
    }),

    verifyArtist: protectedProcedure
        .input(
            z.object({
                requestedHandle: z.string(),
                twitter: z.string().url().optional(),
                website: z.string().url().optional(),
                location: z.string().optional(),
                method: z.enum(verificationMethods),
                artistCode: z.string().optional()
            })
        )
        .mutation(async ({ input, ctx }) => {
            switch (input.method) {
                case 'artist_code':
                    {
                        if (!input.artistCode) {
                            throw new TRPCError({
                                code: 'BAD_REQUEST',
                                message: 'Artist code is required'
                            })
                        }

                        // Check if the artist code exists
                        const artistCode = await db.query.artistCodes.findFirst({
                            where: eq(artistCodes.code, input.artistCode)
                        })

                        if (!artistCode) {
                            throw new TRPCError({
                                code: 'BAD_REQUEST',
                                message: 'Artist code does not exist'
                            })
                        }

                        const db_promise = createArtist(
                            {
                                requestedHandle: input.requestedHandle,
                                twitter: input.twitter ?? '',
                                website: input.website ?? '',
                                location: input.location ?? '',
                                method: 'artist_code',
                                artistCode: input.artistCode
                            },
                            ctx.auth.userId
                        )

                        // Notify the user that they've been approved
                        const knock_promise = sendNotification({
                            type: KnockWorkflows.VerificationApproved,
                            recipients: [ctx.auth.userId],
                            data: {
                                artist_handle: input.requestedHandle
                            }
                        })

                        // Delete artist code
                        const delete_promise = db
                            .delete(artistCodes)
                            .where(eq(artistCodes.code, input.artistCode))

                        await Promise.all([db_promise, knock_promise, delete_promise])
                    }
                    break
                case 'twitter':
                    {
                        // Create the artist verification object in the db
                        const db_promise = db.insert(artistVerifications).values({
                            id: createId(),
                            userId: ctx.auth.userId,
                            requestedHandle: input.requestedHandle,
                            location: input.location ?? '',
                            twitter: input.twitter ?? '',
                            website: input.website ?? ''
                        })

                        // Notify the user of the request
                        const knock_promise = sendNotification({
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
                    input.method === 'artist_code'
                        ? '/artists/apply/success'
                        : '/artists/apply/further-steps'
            }
        }),

    verifyFromCon: protectedProcedure
        .input(
            z.object({
                requestedHandle: z.string(),
                location: z.string(),
                twitter: z.string().url().optional(),
                website: z.string().url().optional(),
                conSlug: z.string()
            })
        )
        .mutation(async ({ input, ctx }) => {
            const artistPromise = ctx.db.query.artists.findFirst({
                where: eq(artists.handle, input.requestedHandle)
            })

            const conPromise = ctx.db.query.conSignUp.findFirst({
                where: eq(conSignUp.slug, input.conSlug)
            })

            const [artist, con] = await Promise.all([artistPromise, conPromise])

            if (artist) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'Artist already exists'
                })
            }

            if (con?.expiresAt && con.expiresAt < new Date()) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'Con has expired'
                })
            }

            await createArtist(
                {
                    requestedHandle: input.requestedHandle,
                    location: input.location,
                    twitter: input.twitter ?? '',
                    method: 'artist_code',
                    website: input.website ?? ''
                },
                ctx.auth.userId
            )
        })
})

async function createArtist(input: VerificationDataType, userId: string) {
    const social_accounts: SocialAccount[] = []
    const clerk = await clerkClient()

    if (input.twitter) {
        social_accounts.push({
            agent: 'twitter',
            url: input.twitter
        })
    }

    if (input.website) {
        social_accounts.push({
            agent: 'website',
            url: input.website
        })
    }

    // Get the user from the database
    const user = await clerk.users.getUser(userId)
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
        stripeAccount: generated_stripe_account.id,
        location: input.location,
        userId: user.id,
        handle: input.requestedHandle,
        socials: social_accounts
    })

    const artist = await db.query.artists.findFirst({
        where: eq(artists.id, generated_id)
    })

    if (!artist) {
        throw new Error('Artist could not be created!')
    }

    // Update the user in clerk
    const clerk_promise = clerk.users.updateUserMetadata(user.id, {
        publicMetadata: {
            handle: artist.handle,
            role: 'artist',
            artistId: artist.id
        } satisfies NemuPublicUserMetadata,
        privateMetadata: {
            artistId: artist.id
        }
    })

    // Update Algolia
    const algolia_promise = setIndex('artists', {
        objectID: artist.id,
        handle: artist.handle,
        about: artist.about,
        imageUrl: user.imageUrl
    })

    await Promise.all([clerk_promise, algolia_promise])

    return artist
}
