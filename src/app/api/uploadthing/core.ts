/* eslint-disable @typescript-eslint/only-throw-error */

import { clerkClient, getAuth } from '@clerk/nextjs/server'
import { type NextRequest } from 'next/server'
import { UploadThingError } from 'uploadthing/server'
import { createUploadthing, type FileRouter } from 'uploadthing/next'
import { redis } from '~/server/redis'
import { db } from '~/server/db'
import { artists } from '~/server/db/schema'
import { eq } from 'drizzle-orm'

const f = createUploadthing()

const validate_auth = async (req: NextRequest, check_artist = false) => {
    const auth = getAuth(req)
    if (!auth.userId) {
        throw new UploadThingError('Unauthorized')
    }

    const user = await (await clerkClient()).users.getUser(auth.userId)
    const artistId = user.privateMetadata.artist_id as string | undefined

    if (check_artist) {
        if (!artistId) {
            throw new UploadThingError('Unauthorized')
        }
    }

    return {
        user,
        artistId
    }
}

export const nemuFileRouter = {
    /**
     * Handles Artist Header Upload
     */
    headerPhotoUploader: f({ image: { maxFileCount: 1, maxFileSize: '4MB' } })
        .middleware(async ({ req }) => await validate_auth(req, true))
        .onUploadComplete(async ({ metadata, file }) => {
            if (!metadata.artistId) return

            await db
                .update(artists)
                .set({
                    headerPhoto: file.key
                })
                .where(eq(artists.id, metadata.artistId))
        }),

    /**
     * Handles uploading portfolio photos
     */
    portfolioUploader: f({ image: { maxFileCount: 1, maxFileSize: '4MB' } })
        .middleware(async ({ req }) => await validate_auth(req, true))
        .onUploadComplete(async ({ metadata, file }) => {
            if (!metadata.artistId) return

            await redis.zadd('portfolio:images', {
                member: file.key,
                score: Math.floor((Date.now() + 3600000) / 1000)
            })
        }),

    /**
     * Handles uploading commission images
     */
    commissionImageUploader: f({ image: { maxFileCount: 5, maxFileSize: '4MB' } })
        .middleware(async ({ req }) => await validate_auth(req, true))
        .onUploadComplete(async ({ metadata, file }) => {
            if (!metadata.artistId) return

            await redis.zadd('commission:images', {
                member: file.key,
                score: Math.floor((Date.now() + 3600000) / 1000)
            })
        }),

    /**
     * Handles delvering a commission
     */
    commissionDownloadUploader: f({
        image: { maxFileCount: 1, maxFileSize: '16MB' },
        'application/zip': { maxFileCount: 1, maxFileSize: '16MB' }
    })
        .middleware(async ({ req }) => await validate_auth(req, true))
        .onUploadComplete(() => {
            console.log('Delivery Upload Complete')
        }),

    productImageUploader: f({ image: { maxFileCount: 5, maxFileSize: '4MB' } })
        .middleware(async ({ req }) => await validate_auth(req, true))
        .onUploadComplete(async ({ metadata, file }) => {
            if (!metadata.artistId) return

            await redis.zadd('product:images', {
                member: file.key,
                score: Math.floor((Date.now() + 3600000) / 1000)
            })
        }),

    productDownloadUploader: f({
        'application/zip': { maxFileCount: 1, maxFileSize: '2GB' }
    })
        .middleware(async ({ req }) => await validate_auth(req, true))
        .onUploadComplete(async ({ metadata, file }) => {
            if (!metadata.artistId) return

            await redis.zadd('product:downloads', {
                member: file.key,
                score: Math.floor((Date.now() + 3600000) / 1000)
            })
        })
} satisfies FileRouter

export type NemuFileRouterType = typeof nemuFileRouter
