import { DashboardCreateButton } from '~/components/ui/button'
import { PortfolioList } from './list'
import { api } from '~/trpc/server'

export default async function DashboardPortfolioPage() {
    const dashboard_links = await api.stripe.getDashboardLinks()

    return (
        <div className="container mx-auto px-5 py-10">
            <div className="mb-6 flex items-center justify-between">
                <h1 className="text-3xl font-bold">My Portfolio</h1>
                <DashboardCreateButton
                    onboarded={dashboard_links.onboarded}
                    text="New Item"
                    href="/dashboard/portfolio/create"
                />
            </div>

            <PortfolioList />
        </div>
    )
}
