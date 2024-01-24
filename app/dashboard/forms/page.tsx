import DashboardContainer from '@/components/dashboard/dashboard-container'

import CommissionCreateForm from '@/components/dashboard/forms/commission-form-create-form'
import DashboardFormsList from '@/components/dashboard/commissions/forms/dashboard-forms'

export default function DashboardForms() {
    return (
        <DashboardContainer title="Forms" modal={<CommissionCreateForm />}>
            <DashboardFormsList />
        </DashboardContainer>
    )
}
