'use server'

import { auth, clerkClient } from '@clerk/nextjs/server'
import { createId } from '@paralleldrive/cuid2'
import { and, eq } from 'drizzle-orm'
import { revalidateTag } from 'next/cache'
import { set_index } from '~/core/search'

import {
    type CommissionAvailability,
    type NemuImageData,
    UserRole
} from '~/core/structures'
import { format_to_currency } from '~/lib/utils'

import { db } from '~/server/db'
import { commissions } from '~/server/db/schema'

type SetCommissionInput = {
    title: string
    description: string
    price: number
    availability: CommissionAvailability
    images: NemuImageData[]
    form_id: string
    max_commissions_until_waitlist?: number
    max_commissions_until_closed?: number
    published?: boolean
}

type AuthCheckReturnType =
    | {
          success: false
      }
    | {
          success: true
          artist_id: string
          artist_handle: string
      }

/**
 * Creates a new commission for the given artist
 *
 * @param {SetCommissionInput} data - The data to create the commission with
 */
export async function set_commission(data: SetCommissionInput) {
    const auth_check = await get_auth()
    if (!auth_check.success) {
        console.error('Auth Check Failed')
        return { success: false }
    }

    // Create Slug
    const slug = data.title
        .toLowerCase()
        .replace(/[^a-zA-Z ]/g, '')
        .replaceAll(' ', '-')

    // Check if it already exists for the artist
    let slug_exists
    try {
        slug_exists = await db.query.commissions.findFirst({
            where: and(
                eq(commissions.artist_id, auth_check.artist_id),
                eq(commissions.slug, slug)
            )
        })

        if (slug_exists === undefined) {
            console.error('An error occurred while checking for slug existence')
            return { success: false }
        }
    } catch (e) {
        console.error('Failed to check for slug existence: ', e)
        return { success: false }
    }

    if (slug_exists) {
        console.error('Slug already exists')
        return { success: false }
    }

    // Create database object
    const commission_id = createId()

    try {
        await db.insert(commissions).values({
            id: commission_id,
            artist_id: auth_check.artist_id,
            title: data.title,
            description: data.description,
            price: data.price,
            images: data.images,
            availability: data.availability,
            slug: slug,
            max_commissions_until_waitlist: data.max_commissions_until_closed,
            max_commissions_until_closed: data.max_commissions_until_closed,
            published: data.published ?? false,
            form_id: data.form_id,
            rating: '5.00'
        })
    } catch (e) {
        console.error('Failed to create commission: ', e)
        return { success: false }
    }

    // Update Algolia
    try {
        await set_index('commissions', {
            objectID: commission_id,
            title: data.title,
            price: format_to_currency(data.price),
            description: data.description,
            featured_image: data.images[0]!.url,
            slug: slug,
            artist_handle: auth_check.artist_handle,
            published: data.published ?? false
        })
    } catch (e) {
        console.error('Failed to update Algolia: ', e)
        return { success: false }
    }

    // Invalidate cache
    revalidateTag('commission_list')

    return { success: true }
}

export async function update_commission() {
    return { success: true }
}

/**
 * Checks if the user is logged in and if they are an artist
 */
async function get_auth(): Promise<AuthCheckReturnType> {
    const auth_data = await auth()
    const clerk_client = await clerkClient()

    if (!auth_data.userId) {
        console.error('User not logged in')
        return { success: false }
    }

    const user = await clerk_client.users.getUser(auth_data.userId)
    const user_role = user.publicMetadata.role as UserRole | undefined

    if (user_role !== UserRole.Artist) {
        console.error('User is not an artist')
        return { success: false }
    }

    return {
        success: true,
        artist_id: user.privateMetadata.artist_id as string,
        artist_handle: user.publicMetadata.handle as string
    }
}
