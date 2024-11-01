'use server'

import { auth, clerkClient } from '@clerk/nextjs/server'
import { eq, type InferSelectModel } from 'drizzle-orm'
import { revalidateTag } from 'next/cache'

import { type KanbanContainerData, type KanbanTask, UserRole } from '~/core/structures'

import { db } from '~/server/db'
import { kanbans, requests } from '~/server/db/schema'

type KanbanReturnType = Promise<
    { success: false } | { success: true; kanban: InferSelectModel<typeof kanbans> }
>

/**
 * Gets the kanban for the given kanban id
 *
 * @param {string} kanban_id - The id of the kanban to get
 */
export async function get_kanban(kanban_id: string): KanbanReturnType {
    // Check if the user is logged in
    const auth_data = await auth()
    if (!auth_data.userId) {
        return { success: false }
    }

    // Get the kanban from the database
    let kanban
    try {
        kanban = await db.query.kanbans.findFirst({
            where: eq(kanbans.id, kanban_id)
        })
    } catch (e) {
        console.error('Failed to get kanban: ', e)
        return { success: false }
    }

    if (!kanban) {
        return { success: false }
    }

    return { success: true, kanban }
}

export async function get_kanban_messages(sendbird_channel_url: string) {
    // Check if the user is logged in
    const auth_data = await auth()
    if (!auth_data.userId) {
        console.error('User not logged in')
        return undefined
    }

    let request
    try {
        request = await db.query.requests.findFirst({
            where: eq(requests.kanban_id, sendbird_channel_url),
            with: {
                kanban: true
            }
        })
    } catch (e) {
        console.error('Failed to get request: ', e)
        return undefined
    }

    if (!request?.kanban) {
        return undefined
    }

    return {
        id: request.kanban_id,
        containers: request.kanban.containers as KanbanContainerData[],
        tasks: request.kanban.tasks as KanbanTask[]
    }
}

export async function update_kanban(
    kanban_id: string,
    containers: string,
    tasks: string
) {
    // Check if the user is logged in
    const auth_data = await auth()
    if (!auth_data.userId) {
        console.error('User not logged in')
        return { success: false }
    }

    // Check if the user is an artist
    const clerk_client = await clerkClient()
    const user = await clerk_client.users.getUser(auth_data.userId)
    if (user.publicMetadata.role !== UserRole.Artist) {
        console.error('User is not an artist')
        return { success: false }
    }

    // Update the kanban in the database
    try {
        await db
            .update(kanbans)
            .set({
                containers: JSON.parse(containers),
                tasks: JSON.parse(tasks)
            })
            .where(eq(kanbans.id, kanban_id))
    } catch (e) {
        console.error('Failed to update kanban: ', e)
        return { success: false }
    }

    // Invalidate cache
    revalidateTag('commission_requests')

    return { success: true }
}

// TODO: Probably fix this because this seems bad
export async function add_to_kanban(
    kanban_id: string,
    container_id: string,
    content: string
) {
    // Check if the user is logged in
    const auth_data = await auth()
    if (!auth_data.userId) {
        console.error('User not logged in')
        return { success: false }
    }

    // Check if the user is an artist
    const clerk_client = await clerkClient()
    const user = await clerk_client.users.getUser(auth_data.userId)
    if (user.publicMetadata.role !== UserRole.Artist) {
        console.error('User is not an artist')
        return { success: false }
    }

    // Fetch the kanban from the database
    let kanban
    try {
        kanban = await db.query.kanbans.findFirst({
            where: eq(kanbans.id, kanban_id)
        })
    } catch (e) {
        console.error('Failed to get kanban: ', e)
        return { success: false }
    }

    if (!kanban) {
        return { success: false }
    }

    // Add Item to kanban
    const prev_tasks: KanbanTask[] = kanban.tasks ? (kanban.tasks as KanbanTask[]) : []

    try {
        await db
            .update(kanbans)
            .set({
                tasks: [
                    ...prev_tasks,
                    {
                        id: crypto.randomUUID(),
                        container_id,
                        content
                    }
                ]
            })
            .where(eq(kanbans.id, kanban_id))
    } catch (e) {
        console.error('Failed to add to kanban: ', e)
        return { success: false }
    }

    return { success: true }
}
