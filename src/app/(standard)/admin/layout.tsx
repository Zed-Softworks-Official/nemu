import { redirect } from 'next/navigation'
import { currentUser } from '@clerk/nextjs/server'

import { UserRole } from '~/lib/structures'

export default async function AdminLayout(props: { children: React.ReactNode }) {
    const user = await currentUser()

    if (!user) {
        return redirect('/u/login')
    }

    if (user.publicMetadata.role !== UserRole.Admin) {
        return redirect('/')
    }

    return <>{props.children}</>
}
