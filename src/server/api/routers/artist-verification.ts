import { z } from 'zod'
import { clerkClient } from '@clerk/nextjs/server'
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
import { err, fromPromise, ok } from 'neverthrow'
import { tryCatch } from '~/lib/try-catch'
import { trpcResult } from '~/lib/trpc-result'
import { captureException } from '~/lib/sentry'

export const artistVerificationRouter = createTRPCRouter({
    generateArtistCode: adminProcedure
        .input(
            z.object({
                amount: z.number().min(1).max(100)
            })
        )
        .mutation(async ({ input, ctx }) => {
            const codes = Array.from({ length: input.amount }, () => ({
                id: createId(),
                code: 'NEMU-' + crypto.randomUUID()
            }))

            const { error } = await tryCatch(ctx.db.insert(artistCodes).values(codes))
            if (error) {
                captureException(error)

                return trpcResult(
                    err({
                        message: 'Failed to insert artist codes',
                        cause: error
                    })
                )
            }

            return trpcResult(ok({ codes: codes.map((code) => code.code) }))
        }),

    getArtistCodes: adminProcedure.query(async ({ ctx }) => {
        const result = await fromPromise(
            ctx.db.query.artistCodes.findMany(),
            (error) =>
                new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Failed to get artist codes',
                    cause: error
                })
        ).match(
            (data) => data,
            (error) => {
                throw error
            }
        )

        return result
    }),

    getArtistVerifications: adminProcedure.query(async ({ ctx }) => {
        const result = await fromPromise(
            ctx.db.query.artistVerifications.findMany(),
            (error) =>
                new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Failed to get artist verifications',
                    cause: error
                })
        ).match(
            (data) => data,
            (error) => {
                throw error
            }
        )

        return result
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
        }),

    acceptArtist: adminProcedure
        .input(
            z.object({
                id: z.string()
            })
        )
        .mutation(async ({ input, ctx }) => {
            const verificationData = await ctx.db.query.artistVerifications.findFirst({
                where: eq(artistVerifications.id, input.id)
            })

            if (!verificationData) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Verification data not found'
                })
            }

            const createArtistPromise = createArtist(
                {
                    requestedHandle: verificationData.requestedHandle,
                    location: verificationData.location,
                    twitter: verificationData.twitter ?? '',
                    website: verificationData.website ?? '',
                    method: 'twitter'
                },
                verificationData.userId
            )

            const deleteVerificationPromise = ctx.db
                .delete(artistVerifications)
                .where(eq(artistVerifications.id, input.id))

            const knockPromise = sendNotification({
                type: KnockWorkflows.VerificationApproved,
                recipients: [verificationData.userId],
                data: {
                    artist_handle: verificationData.requestedHandle
                }
            })

            await Promise.all([
                createArtistPromise,
                deleteVerificationPromise,
                knockPromise
            ])
        }),

    rejectArtist: adminProcedure
        .input(
            z.object({
                id: z.string()
            })
        )
        .mutation(async ({ input, ctx }) => {
            const verificationData = await ctx.db.query.artistVerifications.findFirst({
                where: eq(artistVerifications.id, input.id)
            })

            if (!verificationData) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Verification data not found'
                })
            }

            const deleteVerificationPromise = ctx.db
                .delete(artistVerifications)
                .where(eq(artistVerifications.id, input.id))

            const knockPromise = sendNotification({
                type: KnockWorkflows.VerificationRejected,
                recipients: [verificationData.userId],
                data: undefined
            })

            await Promise.all([deleteVerificationPromise, knockPromise])
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
