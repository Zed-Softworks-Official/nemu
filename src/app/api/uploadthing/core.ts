import { createUploadthing, type FileRouter } from 'uploadthing/next'
import { UploadThingError } from 'uploadthing/server'

import { getServerAuthSession } from '~/server/auth'
import { db } from '~/server/db'
import { api } from '~/trpc/server'

const f = createUploadthing()

export const nemuFileRouter = {
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
            // await api.user.set_profile_photo(file.url)
            await db.user.update({
                where: {
                    id: metadata.userId
                },
                data: {
                    image: file.url
                }
            })

            return { uploadedBy: metadata.userId, url: file.url }
        })
} satisfies FileRouter

export type NemuFileRouterType = typeof nemuFileRouter
