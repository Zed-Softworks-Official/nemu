import { currentUser } from '@clerk/nextjs/server'
import { createUploadthing, type FileRouter } from 'uploadthing/next'
import { UploadThingError } from 'uploadthing/server'
import { UserRole } from '~/core/structures'

import { db } from '~/server/db'
import { utapi } from '~/server/uploadthing'

const f = createUploadthing()

const auth = async (check_artist: boolean) => {
    const user = await currentUser()

    if (!user) {
        throw new UploadThingError('Unauthorized')
    }

    if (check_artist) {
        if (user.publicMetadata.role !== UserRole.Artist) {
            throw new UploadThingError('Unauthorized')
        }
    }

    return { user }
}

export const nemuFileRouter = {
    /**
     * Handles uploading profile photos
     */
    profilePhotoUploader: f({
        image: { maxFileCount: 1, maxFileSize: '4MB' }
    })
        .middleware(() => auth(false))
        .onUploadComplete(async ({ metadata, file }) => {
            // const user = await db.user.findFirst({
            //     where: {
            //         id: metadata.user.id
            //     }
            // })

            // if (!user) {
            //     throw new UploadThingError('Unauthorized')
            // }

            // // Delete previous header
            // if (user.utKey) {
            //     await utapi.deleteFiles(user.utKey)
            // }

            // // Update user image in db
            // await db.user.update({
            //     where: {
            //         id: metadata.userId
            //     },
            //     data: {
            //         image: file.url,
            //         utKey: file.key
            //     }
            // })

            // return { uploadedBy: metadata.userId, url: file.url }
        }),

    /**
     * Handles Artist Header Upload
     */
    headerPhotoUploader: f({ image: { maxFileCount: 1, maxFileSize: '4MB' } })
        .middleware(async () => {
            const user = await currentUser()

            if (!user || user.publicMetadata.role !== UserRole.Artist) {
                throw new UploadThingError('Unauthorized')
            }

            return { user: user }
        })
        .onUploadComplete(async ({ metadata, file }) => {
            // const artist = await db.artist.findFirst({
            //     where: {
            //         id: metadata.user.publicMetadata.artist_id!
            //     }
            // })
            // if (!artist) {
            //     throw new UploadThingError('Unauthorized')
            // }
            // // Delete old header photo
            // if (artist.utKey) {
            //     await utapi.deleteFiles(artist.utKey)
            // }
            // // Update new headerphoto
            // await db.artist.update({
            //     where: {
            //         id: metadata.user.3
            //     },
            //     data: {
            //         headerPhoto: file.url,
            //         utKey: file.key
            //     }
            // })
        }),

    /**
     * Handles uploading portfolio photos
     */
    portfolioUploader: f({ image: { maxFileCount: 1, maxFileSize: '4MB' } })
        .middleware(async ({ req }) => {
            // const session = await getServerAuthSession()

            // if (!session || !session.user.artist_id) {
            //     throw new UploadThingError('Unauthorized')
            // }

            return {}
        })
        .onUploadComplete(async () => {}),

    /**
     * Hanldes uploading product photos
     */
    productImageUploader: f({
        image: { maxFileCount: 5, maxFileSize: '4MB' }
    })
        .middleware(async ({ req }) => {
            // const session = await getServerAuthSession()

            // if (!session || !session.user.artist_id) {
            //     throw new UploadThingError('Unauthorized')
            // }

            return {}
        })
        .onUploadComplete(async () => {}),

    /**
     * Handles uploading product downloads
     */
    productDownloadUploader: f({
        'application/zip': { maxFileCount: 1, maxFileSize: '16GB' }
    })
        .middleware(async ({ req }) => {
            // const session = await getServerAuthSession()

            // if (!session || !session.user.artist_id) {
            //     throw new UploadThingError('Unauthorized')
            // }

            return {}
        })
        .onUploadComplete(async ({ metadata, file }) => {}),

    /**
     * Handles uploading commission images
     */
    commissionImageUploader: f({ image: { maxFileCount: 5, maxFileSize: '16MB' } })
        .middleware(async ({ req }) => {
            // const session = await getServerAuthSession()

            // if (!session || !session.user.artist_id) {
            //     throw new UploadThingError('Unauthorized')
            // }

            return {}
        })
        .onUploadComplete(async ({ metadata, file }) => {})
} satisfies FileRouter

export type NemuFileRouterType = typeof nemuFileRouter
