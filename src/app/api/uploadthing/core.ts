import { createUploadthing, type FileRouter } from 'uploadthing/next'
import { UploadThingError } from 'uploadthing/server'

import { getServerAuthSession } from '~/server/auth'
import { db } from '~/server/db'

const f = createUploadthing()

export const nemuFileRouter = {
    /**
     * Handles uploading profile photos
     */
    profilePhotoUploader: f({
        image: { maxFileCount: 1, maxFileSize: '4MB' }
    })
        .middleware(async ({ req }) => {
            const session = await getServerAuthSession()

            if (!session) {
                throw new UploadThingError('Unauthorized')
            }

            return { userId: session.user.id }
        })
        .onUploadComplete(async ({ metadata, file }) => {
            // Update user image in db
            await db.user.update({
                where: {
                    id: metadata.userId
                },
                data: {
                    image: file.url
                }
            })

            return { uploadedBy: metadata.userId, url: file.url }
        }),

    /**
     * Handles uploading portfolio photos
     */
    portfolioUploader: f({ image: { maxFileCount: 1, maxFileSize: '4MB' } })
        .middleware(async ({ req }) => {
            const session = await getServerAuthSession()

            if (!session || !session.user.artist_id) {
                throw new UploadThingError('Unauthorized')
            }

            return { user: session.user }
        })
        .onUploadComplete(async ({ metadata, file }) => {})
} satisfies FileRouter

export type NemuFileRouterType = typeof nemuFileRouter
