import { auth } from '@clerk/nextjs/server'
import { eq } from 'drizzle-orm'
import { dedupe, flag } from 'flags/next'

import { db } from '~/server/db'
import { artists } from '~/server/db/schema'

const identify = dedupe(async () => {
    const authData = await auth()
    if (!authData?.userId) {
        return null
    }

    return { userId: authData.userId }
})

export const isOnboarded = flag({
    key: 'dashboard-access',
    identify,
    decide: async ({ entities }) => {
        if (!entities?.userId) {
            return false
        }

        const artist = await db.query.artists.findFirst({
            where: eq(artists.userId, entities.userId)
        })

        if (!artist?.onboarded) {
            return false
        }

        return true
    }
})
