import { auth } from '@clerk/nextjs/server'
import { eq } from 'drizzle-orm'

import { db } from '~/server/db'
import { users } from '~/server/db/schema'

export async function verify_clerk_auth(opts?: { verify_artist?: boolean }) {
    const auth_data = auth()

    // If the user is not logged in, return false
    // or if the user doesn't exist in the database, return false
    if (!auth_data.userId) return false

    // Get the user from the database
    const user = await db.query.users.findFirst({
        where: eq(users.clerk_id, auth_data.userId)
    })

    // if the user is an artist and we're checking for an artist, return true
    if (opts?.verify_artist && user?.role === 'artist') return true

    // if everything fails, how'd we get here?
    // finally, return false
    return false
}
