'use server'

import { z } from 'zod'

import { auth, clerkClient } from '@clerk/nextjs/server'
import { createId } from '@paralleldrive/cuid2'
import { eq } from 'drizzle-orm'

import { db } from '~/server/db'
import { portfolios } from '~/server/db/schema'
import { revalidateTag } from 'next/cache'
import { utapi } from '../uploadthing'

/**
 * Portfolio Item Creation Validation Schema
 */
const create_portfolio_data = z.object({
    title: z.string().min(0),
    image_url: z.string(),
    ut_key: z.string()
})

type CreatePortfolioDataType = z.infer<typeof create_portfolio_data>

/**
 * Server Action for creating a new portfolio item, This function validates all
 * data for the portfolio item and also creates a new database entry for the artist
 *
 * @param {CreatePortfolioDataType} data - Contains the data for the portfolio item
 */
export async function set_portfolio_item(data: CreatePortfolioDataType) {
    // Check if the user is logged in
    const auth_data = await auth()
    const clerk_client = await clerkClient()

    if (!auth_data.userId) {
        console.error('User not signed in')

        return { success: false }
    }

    // Get artist id
    const artist_id = (await clerk_client.users.getUser(auth_data.userId)).privateMetadata
        .artist_id as string

    if (!artist_id) {
        console.error('User is not an artist')

        return { success: false }
    }

    // Validate the form
    const validateFields = create_portfolio_data.safeParse(data)

    if (validateFields.error) {
        console.error('Failed to validate fields')

        return { success: false, errors: validateFields.error.errors }
    }

    // Create the new portfolio item
    await db.insert(portfolios).values({
        id: createId(),
        artist_id,
        title: validateFields.data.title,
        image_url: validateFields.data.image_url,
        ut_key: validateFields.data.ut_key
    })

    // Invalidate cache
    revalidateTag('portfolio_list')

    return { success: true }
}

/**
 * Handles deleting a portfolio item using the item id
 *
 * @param {string} item_id - The id of the portfolio item
 */
export async function delete_portfolio_item(item_id: string) {
    // Check if user is logged in
    const auth_data = await auth()
    if (!auth_data.userId) {
        console.error('User not signed in')

        return { success: false }
    }

    // Get the portfolio item
    const portfolio_item = await db.query.portfolios.findFirst({
        where: eq(portfolios.id, item_id)
    })

    // Check if the portfolio item exists
    if (!portfolio_item) {
        console.error('Could not find portfolio item')

        return { success: false }
    }

    // Delete the item from upload thing
    await utapi.deleteFiles([portfolio_item.ut_key])

    // Delete in the database
    await db.delete(portfolios).where(eq(portfolios.id, portfolio_item.id))

    // Invalidate cache
    revalidateTag('portfolio_list')
    revalidateTag('portfolio')

    return { success: true }
}

/**
 * Updates the current portfolio item
 * This function is skipped if the titles haven't changed
 *
 * @param {string} id - The id of the portfolio id
 * @param {string} new_title - The new portfolio item
 */
export async function update_portfolio_item(id: string, new_title: string) {
    // Check if the user is logged in
    const auth_data = await auth()
    if (!auth_data.userId) {
        console.error('User not signed in')

        return { success: false }
    }

    // Get the portfolio item
    const portfolio_item = await db.query.portfolios.findFirst({
        where: eq(portfolios.id, id)
    })

    if (!portfolio_item) {
        console.error('Portfolio item could not be found')

        return { success: false }
    }

    // If the title didn't update then there's nothing to do
    if (portfolio_item.title === new_title) {
        return { success: true }
    }

    // Update the portfolio item
    await db
        .update(portfolios)
        .set({
            title: new_title
        })
        .where(eq(portfolios.id, portfolio_item.id))

    // Invalidate the cache
    revalidateTag('portfolio_list')
    revalidateTag('portfolio')

    return { success: true }
}
