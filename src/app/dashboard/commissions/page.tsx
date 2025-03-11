import { DashboardCreateButton } from '~/components/ui/button'
import { CommissionList } from './commission-list'

import { isOnboarded } from '~/lib/flags'

export default async function CommissionsDashboardPage() {
    const onboarded = await isOnboarded()

    return (
        <div className="container mx-auto px-5 py-10">
            <div className="mb-6 flex items-center justify-between">
                <h1 className="text-3xl font-bold">My Commissions</h1>
                <DashboardCreateButton
                    onboarded={onboarded}
                    text="New Commission"
                    href="/dashboard/commissions/create"
                />
            </div>

            <CommissionList />
        </div>
    )
}
