import { clerkClient, type WebhookEvent } from '@clerk/nextjs/server'

import { db } from '~/server/db'
import { knock } from '~/server/knock'
import { artists } from '~/server/db/schema'

import type { NemuPublicUserMetadata, UserRole } from '~/lib/types'
import { eq } from 'drizzle-orm'
import { updateIndex } from '~/server/algolia/collections'

export async function syncClerkData(event: WebhookEvent) {
    switch (event.type) {
        case 'user.created':
            return await userCreated(
                event.data.id,
                event.data.username ?? 'Unknown User',
                event.data.email_addresses[0]?.email_address ?? 'Unknown Email'
            )
        case 'user.updated':
            return await userUpdated(
                event.data.id,
                event.data.public_metadata.role as UserRole,
                event.data.image_url
            )
    }
}

async function userCreated(clerkId: string, username: string, email: string) {
    const clerk = await clerkClient()

    const userUpdatePromise = clerk.users.updateUserMetadata(clerkId, {
        publicMetadata: {
            role: 'standard'
        } satisfies NemuPublicUserMetadata
    })

    const knockIdentifyPromise = knock.users.identify(clerkId, {
        username,
        email
    })

    await Promise.all([userUpdatePromise, knockIdentifyPromise])
}

async function userUpdated(clerkId: string, role: UserRole, imageUrl: string) {
    if (role !== 'artist') return

    const artist = await db.query.artists.findFirst({
        where: eq(artists.userId, clerkId)
    })

    if (!artist) return

    await updateIndex('artists', {
        objectID: artist.id,
        handle: artist.handle,
        about: artist.about,
        imageUrl
    })
}
