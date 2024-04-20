import { createUploadthing, type FileRouter } from 'uploadthing/next'
import { UploadThingError } from 'uploadthing/server'

import { getServerAuthSession } from '~/server/auth'
import { db } from '~/server/db'
import { utapi } from '~/server/uploadthing'

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
            const user = await db.user.findFirst({
                where: {
                    id: metadata.userId
                }
            })

            if (!user) {
                throw new UploadThingError('Unauthorized')
            }

            // Delete previous header
            if (user.utKey) {
                await utapi.deleteFiles(user.utKey)
            }

            // Update user image in db
            await db.user.update({
                where: {
                    id: metadata.userId
                },
                data: {
                    image: file.url,
                    utKey: file.key
                }
            })

            return { uploadedBy: metadata.userId, url: file.url }
        }),

    /**
     * Handles Artist Header Upload
     */
    headerPhotoUploader: f({ image: { maxFileCount: 1, maxFileSize: '4MB' } })
        .middleware(async ({ req }) => {
            const session = await getServerAuthSession()

            if (!session || !session.user.artist_id) {
                throw new UploadThingError('Unauthorized')
            }

            return { user: session.user }
        })
        .onUploadComplete(async ({ metadata, file }) => {
            const artist = await db.artist.findFirst({
                where: {
                    id: metadata.user.artist_id
                }
            })

            if (!artist) {
                throw new UploadThingError('Unauthorized')
            }

            // Delete old header photo
            if (artist.utKey) {
                await utapi.deleteFiles(artist.utKey)
            }

            // Update new headerphoto
            await db.artist.update({
                where: {
                    id: metadata.user.artist_id!
                },
                data: {
                    headerPhoto: file.url,
                    utKey: file.key
                }
            })
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
        .onUploadComplete(async ({ metadata, file }) => {}),

    /**
     * Hanldes uploading product photos
     */
    productImageUploader: f({
        image: { maxFileCount: 5, maxFileSize: '4MB' }
    })
        .middleware(async ({ req }) => {
            const session = await getServerAuthSession()

            if (!session || !session.user.artist_id) {
                throw new UploadThingError('Unauthorized')
            }

            return { user: session.user }
        })
        .onUploadComplete(async ({ metadata, file }) => {}),

    /**
     * Handles uploading product downloads
     */
    productDownloadUploader: f({
        'application/zip': { maxFileCount: 1, maxFileSize: '16GB' }
    })
        .middleware(async ({ req }) => {
            const session = await getServerAuthSession()

            if (!session || !session.user.artist_id) {
                throw new UploadThingError('Unauthorized')
            }

            return { user: session.user }
        })
        .onUploadComplete(async ({ metadata, file }) => {}),

    /**
     * Handles uploading commission images
     */
    commissionImageUploader: f({ image: { maxFileCount: 5, maxFileSize: '16MB' } })
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
