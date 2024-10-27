'use server'

import { auth, clerkClient } from '@clerk/nextjs/server'
import { createId } from '@paralleldrive/cuid2'
import { eq } from 'drizzle-orm'
import { revalidateTag } from 'next/cache'

import { db } from '~/server/db'
import { forms } from '~/server/db/schema'

export async function set_form(name: string, description: string) {
    const auth_data = await auth()
    if (!auth_data.userId) {
        return { success: false }
    }

    const clerk_client = await clerkClient()
    const user = await clerk_client.users.getUser(auth_data.userId)

    if (!user.privateMetadata.artist_id) {
        return { success: false }
    }

    try {
        await db.insert(forms).values({
            id: createId(),
            name,
            description,
            artist_id: user.privateMetadata.artist_id as string
        })
    } catch (e) {
        console.error('Failed to create form: ', e)
        return { success: false }
    }

    revalidateTag('forms_list')

    return { success: true }
}

export async function set_form_content(form_id: string, content: string) {
    const auth_data = await auth()
    if (!auth_data.userId) {
        return { success: false }
    }

    const clerk_client = await clerkClient()
    const user = await clerk_client.users.getUser(auth_data.userId)

    if (!user.privateMetadata.artist_id) {
        return { success: false }
    }

    try {
        await db
            .update(forms)
            .set({
                content: JSON.parse(content)
            })
            .where(eq(forms.id, form_id))
    } catch (e) {
        console.error('Failed to update form: ', e)
        return { success: false }
    }

    revalidateTag('form')

    return { success: true }
}
