import { currentUser } from '@clerk/nextjs/server'

import { Suspense } from 'react'

import { unstable_cache } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '~/server/db'
import { artists } from '~/server/db/schema'

import Loading from '~/components/ui/loading'

import { notFound } from 'next/navigation'
import ClientSettingsForm from '~/components/dashboard/settings/client-settings-form'

const get_artist_settings = unstable_cache(
    async (artist_id: string) => {
        const artist = await db.query.artists.findFirst({
            where: eq(artists.id, artist_id)
        })

        if (!artist) {
            return undefined
        }

        return {
            about: artist.about,
            location: artist.location,
            terms: artist.terms,
            tip_jar_url: artist.tip_jar_url ?? undefined,
            socials: artist.socials
        }
    },
    ['artist_settings'],
    { tags: ['artist_settings'] }
)

export default function SettingsPage() {
    return (
        <Suspense fallback={<Loading />}>
            <SettingsForm />
        </Suspense>
    )
}

async function SettingsForm() {
    const user = await currentUser()

    if (!user) {
        return notFound()
    }

    const artist_data = await get_artist_settings(
        user.privateMetadata.artist_id as string
    )

    if (!artist_data) {
        return notFound()
    }

    return <ClientSettingsForm artist_data={artist_data} />
}
