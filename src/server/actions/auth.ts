import { auth } from '@clerk/nextjs/server'

export async function verify_clerk_auth() {
    const auth_data = auth()

    // If the user is not logged in, return false
    // or if the user doesn't exist in the database, return false
    if (!auth_data.userId) return false

    return true
}
