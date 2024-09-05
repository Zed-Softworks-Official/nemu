import { currentUser } from '@clerk/nextjs/server'
import { ArrowLeftIcon } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'

import NemuUserProfile from '~/components/auth/user-profile'
import Loading from '~/components/ui/loading'

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

    return (
        <section>
            <Link
                href="/"
                className="btn btn-circle btn-primary absolute left-4 top-4 text-base-content"
            >
                <ArrowLeftIcon className="h-6 w-6" />
            </Link>
            <NemuUserProfile />
        </section>
    )
}
