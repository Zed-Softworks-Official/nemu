import { UserProfile } from '@clerk/nextjs'
import { auth } from '@clerk/nextjs/server'

export default async function AccountPage() {
    await auth.protect()

    return (
        <div className="flex flex-1 items-start justify-center overflow-y-auto">
            <UserProfile />
        </div>
    )
}
