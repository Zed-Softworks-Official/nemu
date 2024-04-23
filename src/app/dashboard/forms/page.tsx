import { ClipboardPlusIcon } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import DashboardContainer from '~/components/ui/dashboard-container'
import EmptyState from '~/components/ui/empty-state'
import { getServerAuthSession } from '~/server/auth'
import { api } from '~/trpc/server'

export default async function FormsDashboardPage() {
    const session = await getServerAuthSession()

    if (!session || !session.user.artist_id) {
        return redirect('/u/login')
    }

    const forms = await api.form.get_form_list({ artist_id: session.user.artist_id })

    if (!forms) {
        return (
            <DashboardContainer title="Forms" contentClassName='h-full'>
                <div className="flex justify-center items-center h-full">
                    <EmptyState
                        create_url="/dashboard/forms/create"
                        heading="No Forms"
                        description="Get started by creating a form"
                        button_text="Create Form"
                        icon={<ClipboardPlusIcon className="w-10 h-10" />}
                    />
                </div>
            </DashboardContainer>
        )
    }

    return (
        <DashboardContainer title="Forms" addButtonUrl="/dashboard/forms/create">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
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
