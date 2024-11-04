'use server'

import { auth } from '@clerk/nextjs/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '~/server/db'
import { artists } from '~/server/db/schema'
import { invalidate_cache } from '~/server/cache'

import { type SocialAccount, SocialAgent } from '~/core/structures'

const artist_settings_schema = z.object({
    about: z.string(),
    location: z.string(),
    terms: z.string(),
    tip_jar_url: z.string().url('Needs to be a valid url!').optional().or(z.literal('')),
    socials: z.array(z.object({ agent: z.string(), url: z.string() }))
})

export async function update_artist_settings(prev_state: unknown, form_data: FormData) {
    // Check if the user is logged in
    const auth_data = await auth()

    if (!auth_data.userId) {
        return { success: false }
    }

    // Get the artist from the db
    const artist = await db.query.artists.findFirst({
        where: eq(artists.user_id, auth_data.userId)
    })

    if (!artist) {
        return { success: false }
    }

    // Collect the social accounts
    const social_accounts: SocialAccount[] = []

    for (const social of form_data.getAll('socials')) {
        const social_url = social as string
        if (social === undefined) continue

        let agent: SocialAgent = SocialAgent.Website
        if (social_url.includes('x.com') || social_url.includes('twitter.com')) {
            agent = SocialAgent.Twitter
        } else if (social_url.includes('pixiv.net')) {
            agent = SocialAgent.Pixiv
        }

        social_accounts.push({
            agent,
            url: social_url
        })
    }

    // Validate the form
    const validateFields = artist_settings_schema.safeParse({
        about: form_data.get('about'),
        location: form_data.get('location'),
        terms: form_data.get('terms'),
        tip_jar_url: form_data.get('tip_jar_url'),
        socials: social_accounts
    })

    if (validateFields.error) {
        console.log(validateFields.error)
        return { success: false, errors: validateFields.error.errors }
    }

    // Update the artist in the database
    await db
        .update(artists)
        .set({
            about:
                validateFields.data?.about !== artist.about
                    ? validateFields.data.about
                    : undefined,
            location:
                validateFields.data.location !== artist.location
                    ? validateFields.data.location
                    : undefined,
            terms:
                validateFields.data.terms !== artist.terms
                    ? validateFields.data.terms
                    : undefined,
            tip_jar_url:
                validateFields.data.tip_jar_url !== artist.tip_jar_url
                    ? validateFields.data.tip_jar_url
                    : undefined,
            socials: social_accounts
        })
        .where(eq(artists.id, artist.id))

    // revalidate the cache
    await invalidate_cache('artist_data')

    return { success: true }
}
