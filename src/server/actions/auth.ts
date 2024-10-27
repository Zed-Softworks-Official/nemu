import { auth, clerkClient } from '@clerk/nextjs/server'

export async function verify_clerk_auth() {
    const auth_data = await auth()

    // If the user is not logged in, return false
    // or if the user doesn't exist in the database, return false
    if (!auth_data.userId) return false

    return true
}

export async function verify_auth() {
    const auth_data = await auth()
    if (!auth_data.userId) return undefined

    const clerk_client = await clerkClient()
    const user = await clerk_client.users.getUser(auth_data.userId)

    return {
        user
    }
}
