'use server'

import { auth, clerkClient } from '@clerk/nextjs/server'
import { createId } from '@paralleldrive/cuid2'
import { eq } from 'drizzle-orm'
import { revalidateTag } from 'next/cache'

import { RequestStatus } from '~/core/structures'

import { db } from '~/server/db'
import { downloads, requests } from '~/server/db/schema'

type DownloadInput = {
    url: string
    ut_key: string
    user_id: string
    request_id: string
}

export async function set_download(data: DownloadInput) {
    // Check if the user is logged in
    const auth_data = await auth()
    const clerk_client = await clerkClient()
    if (!auth_data.userId) {
        return { success: false }
    }

    // Create Download object
    const download_id = createId()

    try {
        await db.insert(downloads).values({
            id: download_id,
            user_id: data.user_id,
            request_id: data.request_id,
            url: data.url,
            ut_key: data.ut_key,
            artist_id: (await clerk_client.users.getUser(auth_data.userId)).publicMetadata
                .artist_id as string
        })
    } catch (e) {
        console.error('Failed to create download: ', e)
        return { success: false }
    }

    // Update the request to include the download id
    try {
        await db
            .update(requests)
            .set({
                download_id: download_id,
                status: RequestStatus.Delivered
            })
            .where(eq(requests.id, data.request_id))
    } catch (e) {
        console.error('Failed to update request: ', e)
        return { success: false }
    }

    // Invalidate cache
    revalidateTag('request_data')

    return { success: true }
}
