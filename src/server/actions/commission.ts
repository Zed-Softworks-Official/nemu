'use server'

import { auth, clerkClient } from '@clerk/nextjs/server'
import { createId } from '@paralleldrive/cuid2'
import { and, eq } from 'drizzle-orm'
import { revalidateTag } from 'next/cache'
import { set_index, update_index } from '~/core/search'

import {
    type CommissionAvailability,
    NemuEditImageData,
    type NemuImageData,
    UserRole
} from '~/core/structures'
import { format_to_currency } from '~/lib/utils'

import { db } from '~/server/db'
import { commissions } from '~/server/db/schema'
import { utapi } from '../uploadthing'

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

type UpdateCommissionInput = {
    commission_id: string
    data: {
        title?: string
        description?: string
        availability?: CommissionAvailability
        images?: NemuEditImageData[]
        deleted_images?: NemuEditImageData[]
        form_id?: string
        price?: number
        max_commissions_until_waitlist?: number
        max_commissions_until_closed?: number
        published?: boolean
    }
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
    // Make sure the user is logged in and an artist
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
            price: format_to_currency(data.price / 100),
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

export async function update_commission(input: UpdateCommissionInput) {
    // Make sure the user is logged in and an artist
    const auth_check = await get_auth()
    if (!auth_check.success) {
        console.error('Auth Check Failed')
        return { success: false }
    }

    // Delete the images from uploadthing
    if (input.data.deleted_images) {
        try {
            await utapi.deleteFiles(
                input.data.deleted_images.map((image) => image.image_data.ut_key!)
            )
        } catch (e) {
            console.error('Failed to delete images from uploadthing: ', e)
            return { success: false }
        }
    }

    // Update the database with the relavent information that has been updated
    let updated_commission
    try {
        await db
            .update(commissions)
            .set({
                title: input.data.title,
                description: input.data.description,
                price: input.data.price,
                images: input.data.images?.map((image) => ({
                    url: image.image_data.url,
                    ut_key: image.image_data.ut_key
                })),
                availability: input.data.availability,
                max_commissions_until_waitlist: input.data.max_commissions_until_waitlist,
                max_commissions_until_closed: input.data.max_commissions_until_closed,
                published: input.data.published,
                form_id: input.data.form_id
            })
            .where(eq(commissions.id, input.commission_id))

        updated_commission = await db.query.commissions.findFirst({
            where: eq(commissions.id, input.commission_id)
        })
    } catch (e) {
        console.error('Failed to update commission: ', e)
        return { success: false }
    }

    if (!updated_commission) {
        console.error('Failed to update commission')
        return { success: false }
    }

    // Update Algolia
    try {
        await update_index('commissions', {
            objectID: input.commission_id,
            title: updated_commission.title,
            price: format_to_currency(updated_commission.price / 100),
            description: updated_commission.description,
            featured_image: updated_commission.images[0]!.url,
            slug: updated_commission.slug,
            artist_handle: auth_check.artist_handle,
            published: updated_commission.published
        })
    } catch (e) {
        console.error('Failed to update Algolia: ', e)
        return { success: false }
    }

    // Invalidate cache
    revalidateTag('commission')
    revalidateTag('commission_list')

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
