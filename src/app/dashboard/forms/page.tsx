import { currentUser } from '@clerk/nextjs/server'
import { ClipboardPlusIcon } from 'lucide-react'
import Link from 'next/link'

import DashboardContainer from '~/components/ui/dashboard-container'
import EmptyState from '~/components/ui/empty-state'
import { Suspense } from 'react'
import Loading from '~/components/ui/loading'
import { db } from '~/server/db'
import { users } from '~/server/db/schema'
import { get_form_list, is_onboarding_complete } from '~/server/db/query'
import { eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'

export default function FormsDashboardPage() {
    return (
        <Suspense fallback={<Loading />}>
            <PageContent />
        </Suspense>
    )
}

async function PageContent() {
    const user = await db.query.users.findFirst({
        where: eq(users.clerk_id, (await currentUser())!.id)
    })

    if (!user) {
        return notFound()
    }

    if (!user.artist_id) {
        return notFound()
    }

    const forms = await get_form_list(user.artist_id)

    const onboarding_complete = await is_onboarding_complete(user.artist_id)

    if (!forms || forms.length === 0) {
        return (
            <DashboardContainer title="Forms" contentClassName="h-full">
                <EmptyState
                    create_url="/dashboard/forms/create"
                    heading="No Forms Found"
                    description="Create a new form to get started"
                    button_text="Create Form"
                    icon={<ClipboardPlusIcon className="h-10 w-10" />}
                    disabled={onboarding_complete}
                />
            </DashboardContainer>
        )
    }

    return (
        <DashboardContainer title="Forms" addButtonUrl="/dashboard/forms/create">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {forms.map((form) => (
                    <Link
                        key={form.id}
                        href={`/dashboard/forms/${form.id}`}
                        className="transition-all duration-200 ease-in-out active:scale-95"
                    >
                        <div className="card bg-base-100 shadow-xl">
                            <div className="card-body">
                                <h2 className="card-title">{form.name}</h2>
                                <p className="text-base-content/60">{form.description}</p>
                            </div>
                        </div>
                    </Link>
                ))}
            </div>
        </DashboardContainer>
    )
}
