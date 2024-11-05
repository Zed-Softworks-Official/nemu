import { redirect } from 'next/navigation'
import { currentUser } from '@clerk/nextjs/server'

import { UserRole } from '~/core/structures'

export default async function Layout({ children }: { children: React.ReactNode }) {
    const user = await currentUser()

    if (!user) {
        return redirect('/u/login')
    }

    if (user.publicMetadata.role !== UserRole.Admin) {
        return redirect('/')
    }

    return <>{children}</>
}
