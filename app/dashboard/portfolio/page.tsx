'use client'

import DashboardContainer from '@/components/dashboard/dashboard-container'
import PortfolioItems from '@/components/dashboard/portfolio/portfolio-items'

export default function PortfolioComponent() {
    return (
        <DashboardContainer title="Portfolio" addButtonUrl="/dashboard/portfolio/add">
            <PortfolioItems />
        </DashboardContainer>
    )
}
