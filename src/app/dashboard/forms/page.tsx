import { DashboardCreateButton } from '~/components/ui/button'
import RequestFormsList from './request-forms-list'
import { isOnboarded } from '~/lib/flags'

export default async function RequestFormsPage() {
    const onboarded = await isOnboarded()

    return (
        <div className="container mx-auto px-5 py-10">
            <div className="mb-6 flex items-center justify-between">
                <h1 className="text-3xl font-bold">My Forms</h1>
                <DashboardCreateButton
                    onboarded={onboarded}
                    text="New Form"
                    href="/dashboard/forms/create"
                />
            </div>
            <RequestFormsList />
        </div>
    )
}
