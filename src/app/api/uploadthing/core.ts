/* eslint-disable @typescript-eslint/only-throw-error */

import { auth, clerkClient } from '@clerk/nextjs/server'
import { type NextRequest } from 'next/server'
import { UploadThingError } from 'uploadthing/server'
import { createUploadthing, type FileRouter } from 'uploadthing/next'

const f = createUploadthing()

const validate_auth = async (req: NextRequest, check_artist = false) => {
    const auth_data = await auth()
    const clerk_client = await clerkClient()

    if (!auth_data.userId) {
        throw new UploadThingError('Unauthorized')
    }

    const user = await clerk_client.users.getUser(auth_data.userId)
    const artist_id = user.privateMetadata.artist_id as string | undefined

    if (check_artist) {
        if (!artist_id) {
            throw new UploadThingError('Unauthorized')
        }
    }

    return {
        user,
        artist_id
    }
}

export const nemuFileRouter = {
    /**
     * Handles Artist Header Upload
     */
    headerPhotoUploader: f({ image: { maxFileCount: 1, maxFileSize: '4MB' } })
        .middleware(async ({ req }) => await validate_auth(req, true))
        .onUploadComplete(async () => {
            console.log('Header Photo Upload Complete')
        }),

    /**
     * Handles uploading portfolio photos
     */
    portfolioUploader: f({ image: { maxFileCount: 1, maxFileSize: '4MB' } })
        .middleware(async ({ req }) => await validate_auth(req, true))
        .onUploadComplete(async () => {
            console.log('Portfolio Upload Complete')
        }),

    /**
     * Handles uploading commission images
     */
    commissionImageUploader: f({ image: { maxFileCount: 5, maxFileSize: '4MB' } })
        .middleware(async ({ req }) => await validate_auth(req, true))
        .onUploadComplete(async () => {
            console.log('Commission Image Upload Complete')
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
        })
} satisfies FileRouter

export type NemuFileRouterType = typeof nemuFileRouter
