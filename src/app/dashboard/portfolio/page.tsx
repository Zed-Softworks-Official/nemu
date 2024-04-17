import DashboardContainer from '~/components/ui/dashboard-container'

export default function CreatePortfolioPage() {
    return (
        <DashboardContainer title="Portfolio" addButtonUrl="/dashboard/portfolio/create">
            <div className="grid grid-cols-3 gap-5"></div>
        </DashboardContainer>
    )
}
