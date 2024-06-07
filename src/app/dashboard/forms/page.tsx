import { currentUser } from '@clerk/nextjs/server'
import { ClipboardPlusIcon } from 'lucide-react'
import Link from 'next/link'

import DashboardContainer from '~/components/ui/dashboard-container'
import EmptyState from '~/components/ui/empty-state'
import { api } from '~/trpc/server'

export default async function FormsDashboardPage() {
    const user = await currentUser()

    const forms = await api.form.get_form_list({
        artist_id: user?.privateMetadata.artist_id as string
    })

    if (!forms || forms.length === 0) {
        return (
            <DashboardContainer title="Forms" contentClassName="h-full">
                <EmptyState
                    create_url="/dashboard/forms/create"
                    heading="No Forms Found"
                    description="Create a new form to get started"
                    button_text="Create Form"
                    icon={<ClipboardPlusIcon className="h-10 w-10" />}
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
