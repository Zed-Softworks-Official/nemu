import PortfolioCreateEditForm from '~/components/dashboard-forms/portfolio-create-edit'
import DashboardContainer from '~/components/ui/dashboard-container'

export default function CreatePortfolioPage() {
    return (
        <DashboardContainer title="Create Portfolio Item">
            <PortfolioCreateEditForm />
        </DashboardContainer>
    )
}
