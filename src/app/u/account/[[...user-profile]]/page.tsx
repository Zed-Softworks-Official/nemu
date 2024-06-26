import { currentUser } from '@clerk/nextjs/server'
import { eq, type InferSelectModel } from 'drizzle-orm'
import { ArrowLeftIcon } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'

import NemuUserProfile from '~/components/auth/user-profile'
import Loading from '~/components/ui/loading'
import { UserRole } from '~/core/structures'
import { db } from '~/server/db'
import { artists } from '~/server/db/schema'

const get_artist_data = async (handle: string) => {
    return await db.query.artists.findFirst({
        where: eq(artists.handle, handle)
    })
}

export default function UserProfilePage() {
    return (
        <Suspense fallback={<Loading />}>
            <PageContent />
        </Suspense>
    )
}

async function PageContent() {
    const user = await currentUser()

    if (!user) {
        return redirect('/u/login')
    }

    let artist: InferSelectModel<typeof artists> | undefined
    if (user.publicMetadata.role === UserRole.Artist) {
        artist = await get_artist_data(user.publicMetadata.handle as string)
    }

    return (
        <section>
            <Link
                href="/"
                className="btn btn-circle btn-primary absolute left-4 top-4 text-base-content"
            >
                <ArrowLeftIcon className="h-6 w-6" />
            </Link>
            <NemuUserProfile artist={artist} />
        </section>
    )
}
