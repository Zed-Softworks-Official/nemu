import DashboardContainer from '@/components/dashboard/dashboard-container'
import CommissionAddForm from '@/components/dashboard/forms/commission-add-form'

export default function CommissionsPageAdd() {
    return (
        <DashboardContainer title="Add a new Commission" breadcrumbs>
            <CommissionAddForm />
        </DashboardContainer>
    )
}
