import DashboardContainer from '@/components/dashboard/dashboard-container'
import PortfolioItems from '@/components/dashboard/portfolio/portfolio-items'

import { api } from '@/core/api/server'
import { getServerAuthSession } from '@/core/auth'

export default async function PortfolioComponent() {
    const session = await getServerAuthSession()
    const portfolio_items = await api.portfolio.get_portfolio_items({
        artist_id: session?.user.artist_id!
    })

    return (
        <DashboardContainer title="Portfolio" addButtonUrl="/dashboard/portfolio/add">
            <PortfolioItems data={portfolio_items} />
        </DashboardContainer>
    )
}
