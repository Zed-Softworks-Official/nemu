import { currentUser } from '@clerk/nextjs/server'
import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { UserRole } from '~/core/structures'
import { db } from '~/server/db'
import { users } from '~/server/db/schema'

export default async function Layout({ children }: { children: React.ReactNode }) {
    const user = await currentUser()

    if (!user) {
        return redirect('/u/login')
    }

    const db_user = await db.query.users.findFirst({
        where: eq(users.clerk_id, user.id)
    })

    if (!db_user || db_user.role !== UserRole.Admin) {
        return redirect('/u/login')
    }

    return <>{children}</>
}
