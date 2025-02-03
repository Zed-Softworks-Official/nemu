import { clerkClient, type WebhookEvent } from '@clerk/nextjs/server'

import { db } from '~/server/db'
import { knock } from '~/server/knock'
import { artists } from '~/server/db/schema'

import { UserRole } from '~/lib/structures'
import { eq } from 'drizzle-orm'
import { update_index } from '~/server/algolia/collections'

export async function sync_clerk_data(event: WebhookEvent) {
    switch (event.type) {
        case 'user.created':
            return await user_created(
                event.data.id,
                event.data.username ?? 'Unknown User',
                event.data.email_addresses[0]?.email_address ?? 'Unknown Email'
            )
        case 'user.updated':
            return await user_updated(
                event.data.id,
                event.data.public_metadata.role as UserRole,
                event.data.image_url
            )
    }
}

async function user_created(clerk_id: string, username: string, email: string) {
    const clerk_client = await clerkClient()

    const user_update = clerk_client.users.updateUserMetadata(clerk_id, {
        publicMetadata: {
            role: UserRole.Standard
        }
    })

    const knock_identify = knock.users.identify(clerk_id, {
        username,
        email
    })

    await Promise.all([user_update, knock_identify])
}

async function user_updated(clerk_id: string, role: UserRole, image_url: string) {
    if (role !== UserRole.Artist) return

    const artist = await db.query.artists.findFirst({
        where: eq(artists.user_id, clerk_id)
    })

    if (!artist) return

    await update_index('artists', {
        objectID: artist.id,
        handle: artist.handle,
        about: artist.about,
        image_url
    })
}
