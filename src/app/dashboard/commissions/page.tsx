import { DashboardCreateButton } from '~/components/ui/button'
import { CommissionList } from './commission-list'
import { api } from '~/trpc/server'

export default async function CommissionsDashboardPage() {
    const dashboardLinks = await api.stripe.getDashboardLinks()

    return (
        <div className="container mx-auto px-5 py-10">
            <div className="mb-6 flex items-center justify-between">
                <h1 className="text-3xl font-bold">My Commissions</h1>
                <DashboardCreateButton
                    onboarded={dashboardLinks.onboarded}
                    text="New Commission"
                    href="/dashboard/commissions/create"
                />
            </div>

            <CommissionList />
        </div>
    )
}
