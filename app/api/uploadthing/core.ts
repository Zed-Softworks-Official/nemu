import { api } from '@/core/api/server'
import { getServerAuthSession } from '@/core/auth'
import { createUploadthing, type FileRouter } from 'uploadthing/next'
import { UploadThingError } from 'uploadthing/server'

const f = createUploadthing()

export const nemuFileRouter = {
    profileRouter: f({ image: { maxFileSize: '4MB' } })
        .middleware(async ({ req }) => {
            const session = await getServerAuthSession()

            if (!session) throw new UploadThingError('Unauthorized')

            return { userId: session.user.id }
        })
        .onUploadComplete(async ({ metadata, file }) => {
            await api.user.set_profile_photo(file.key)

            return { uploadedBy: metadata.userId }
        })
} satisfies FileRouter

export type NemuFileRouter = typeof nemuFileRouter
