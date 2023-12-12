import Commissions from '@/components/dashboard/commissions/commissions'
import DashboardContainer from '@/components/dashboard/dashboard-container'

export default function CommissionsPage() {
    return (
        <DashboardContainer
            title="Commissions"
            addButtonUrl="/commissions/add"
        >
            <Commissions />
        </DashboardContainer>
    )
}
