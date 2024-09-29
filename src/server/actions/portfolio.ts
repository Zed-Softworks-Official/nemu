'use server'

import { z } from 'zod'
import { auth, clerkClient } from '@clerk/nextjs/server'

import { createId } from '@paralleldrive/cuid2'
import { db } from '~/server/db'
import { portfolios } from '~/server/db/schema'
import { revalidateTag } from 'next/cache'

const portfolio_data = z.object({
    title: z.string().min(0),
    image_url: z.string(),
    ut_key: z.string()
})

type PortfolioDataType = z.infer<typeof portfolio_data>

export async function set_portfolio_item(data: PortfolioDataType) {
    // Check if the user is logged in
    const auth_data = auth()

    if (!auth_data.userId) {
        console.error('User not logged in')

        return { success: false }
    }

    // Get artist id
    const artist_id = (await clerkClient().users.getUser(auth_data.userId))
        .privateMetadata.artist_id as string

    // Validate the form
    const validateFields = portfolio_data.safeParse(data)

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
