import { currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

import NemuUserProfile from '~/components/auth/user-profile'
import { UserRole } from '~/core/structures'

export default async function UserProfilePage() {
    const user = await currentUser()

    if (!user) {
        return redirect('/u/login')
    }

    return <NemuUserProfile artist={user.publicMetadata.role === UserRole.Artist} />
}
