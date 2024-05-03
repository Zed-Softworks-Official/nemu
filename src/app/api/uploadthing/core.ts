import { clerkClient, currentUser, getAuth } from '@clerk/nextjs/server'
import { NextRequest } from 'next/server'
import { createUploadthing, type FileRouter } from 'uploadthing/next'
import { UploadThingError } from 'uploadthing/server'
import { UserRole } from '~/core/structures'

import { db } from '~/server/db'
import { utapi } from '~/server/uploadthing'

const f = createUploadthing()

const auth = async (req: NextRequest, check_artist: boolean = false) => {
    const auth = await getAuth(req)

    if (!auth.userId) {
        throw new UploadThingError('Unauthorized')
    }

    return {
        user: await clerkClient.users.getUser(auth.userId)
    }
}

export const nemuFileRouter = {
    /**
     * Handles uploading profile photos
     */
    profilePhotoUploader: f({
        image: { maxFileCount: 1, maxFileSize: '4MB' }
    })
        .middleware(({ req }) => auth(req))
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
        .middleware(({ req }) => auth(req, true))
        .onUploadComplete(async ({ metadata, file }) => {
            const artist = await db.artist.findFirst({
                where: {
                    id: metadata.user.privateMetadata.artist_id as string
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
                    id: metadata.user.privateMetadata.artist_id as string
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
        .middleware(({ req }) => auth(req, true))
        .onUploadComplete(async () => {
            console.log('Portfolio Upload Complete')
        }),

    /**
     * Handles uploading commission images
     */
    commissionImageUploader: f({ image: { maxFileCount: 5, maxFileSize: '16MB' } })
        .middleware(({ req }) => auth(req, true))
        .onUploadComplete(async () => {
            console.log('Commission Image Upload Complete')
        })
} satisfies FileRouter

export type NemuFileRouterType = typeof nemuFileRouter
