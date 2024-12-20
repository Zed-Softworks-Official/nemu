/* eslint-disable @typescript-eslint/only-throw-error */
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'

import { auth, clerkClient } from '@clerk/nextjs/server'
import { type NextRequest } from 'next/server'
import { UploadThingError } from 'uploadthing/server'
import { createUploadthing, type FileRouter } from 'uploadthing/next'

import { db } from '~/server/db'
import { utapi } from '~/server/uploadthing'
import { delivery, requests } from '~/server/db/schema'

import { DownloadType } from '~/lib/structures'

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
        .input(
            z.object({
                order_id: z.string()
            })
        )
        .middleware(async ({ req, input }) => {
            const user = await validate_auth(req, true)

            return {
                ...user,
                ...input
            }
        })
        .onUploadComplete(async ({ file, metadata }) => {
            const data = await db.query.requests.findFirst({
                where: eq(requests.order_id, metadata.order_id),
                with: {
                    delivery: true
                }
            })

            console.log('Uploading delivery', file.key)

            if (!data || !metadata.artist_id) {
                console.log('Request not found')
                throw new UploadThingError('Request not found')
            }

            if (!data?.delivery) {
                console.log('Delivery not found, creating new delivery')
                await db.insert(delivery).values({
                    id: createId(),
                    artist_id: metadata.artist_id,
                    request_id: data.id,
                    user_id: data.user_id,
                    type:
                        file.type === 'application/zip'
                            ? DownloadType.Archive
                            : DownloadType.Image,
                    ut_key: file.key
                })

                return
            }

            console.log('Delivery found, updating delivery')

            const delete_promise = utapi.deleteFiles([data.delivery.ut_key])
            const update_promise = db
                .update(delivery)
                .set({
                    ut_key: file.key,
                    type:
                        file.type === 'application/zip'
                            ? DownloadType.Archive
                            : DownloadType.Image
                })
                .where(eq(delivery.id, data.delivery.id))

            await Promise.all([delete_promise, update_promise])
        })
} satisfies FileRouter

export type NemuFileRouterType = typeof nemuFileRouter
