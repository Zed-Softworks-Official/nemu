import { clerkClient, currentUser, getAuth } from '@clerk/nextjs/server'
import { eq } from 'drizzle-orm'
import { NextRequest } from 'next/server'
import { createUploadthing, type FileRouter } from 'uploadthing/next'
import { UploadThingError } from 'uploadthing/server'

import { db } from '~/server/db'
import { artists } from '~/server/db/schema'
import { utapi } from '~/server/uploadthing'

const f = createUploadthing()

const auth = async (req: NextRequest, check_artist: boolean = false) => {
    const auth = await getAuth(req)

    if (!auth.userId) {
        throw new UploadThingError('Unauthorized')
    }

    const user = await clerkClient.users.getUser(auth.userId)
    if (check_artist) {
        if (!user.privateMetadata.artist_id) {
            throw new UploadThingError('Unauthorized')
        }
    }

    return {
        user
    }
}

export const nemuFileRouter = {
    /**
     * Handles Artist Header Upload
     */
    headerPhotoUploader: f({ image: { maxFileCount: 1, maxFileSize: '4MB' } })
        .middleware(({ req }) => auth(req, true))
        .onUploadComplete(async ({ metadata, file }) => {
            const artist = await db.query.artists.findFirst({
                where: eq(artists.id, metadata.user.privateMetadata.artist_id as string)
            })

            if (!artist) {
                throw new UploadThingError('Unauthorized')
            }

            // Delete old header photo if ther is a utKey
            if (artist.ut_key) {
                await utapi.deleteFiles(artist.ut_key)
            }

            // Update new headerphoto
            await db
                .update(artists)
                .set({
                    header_photo: file.url,
                    ut_key: file.key
                })
                .where(eq(artists.id, artist.id))
        }),

    /**
     * Handles uploading portfolio photos
     */
    portfolioUploader: f({ image: { maxFileCount: 1, maxFileSize: '4MB' } })
        .middleware(({ req }) => auth(req, true))
        .onUploadComplete(async () => {
            console.log('Portfolio Upload Complete')
        }),

    /**
     * Handles uploading commission images
     */
    commissionImageUploader: f({ image: { maxFileCount: 5, maxFileSize: '4MB' } })
        .middleware(({ req }) => auth(req, true))
        .onUploadComplete(async () => {
            console.log('Commission Image Upload Complete')
        }),

    /**
     *
     */
    commissionDownloadUploader: f({
        image: { maxFileCount: 1, maxFileSize: '16MB' },
        'application/zip': { maxFileCount: 1, maxFileSize: '16MB' }
    })
        .middleware(({ req }) => auth(req, true))
        .onUploadComplete(async () => {
            console.log('Commission Download Upload Complete')
        })
} satisfies FileRouter

export type NemuFileRouterType = typeof nemuFileRouter
