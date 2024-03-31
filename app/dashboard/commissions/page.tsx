import DashboardCommissions from '@/components/dashboard/commissions/dashboard-commissions'
import DashboardContainer from '@/components/dashboard/dashboard-container'

export default function CommissionsPage() {
    return (
        <DashboardContainer
            title="Commissions"
            addButtonUrl="/dashboard/commissions/add"
        >
            <DashboardCommissions />
        </DashboardContainer>
    )
}
