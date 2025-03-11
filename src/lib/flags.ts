import { auth } from '@clerk/nextjs/server'
import { eq } from 'drizzle-orm'
import { dedupe, flag } from 'flags/next'

import { db } from '~/server/db'
import { artists } from '~/server/db/schema'
import { tryCatch } from './try-catch'

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

        const { error, data: artist } = await tryCatch(
            db.query.artists.findFirst({
                where: eq(artists.userId, entities.userId)
            })
        )

        if (error) {
            console.error(error)
            return false
        }

        if (!artist?.onboarded) {
            return false
        }

        return true
    }
})
