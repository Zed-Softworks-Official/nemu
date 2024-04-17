import CommissionCreateEditForm from '~/components/dashboard-forms/commission-create-edit'
import DashboardContainer from '~/components/ui/dashboard-container'

export default function CreateCommissionPage() {
    return (
        <DashboardContainer title="Create A New Commission">
            <CommissionCreateEditForm />
        </DashboardContainer>
    )
}
