import DashboardContainer from '@/components/dashboard/dashboard-container'
import CommissionCreateEditForm from '@/components/dashboard/forms/commission-create-edit-form'
import { FormProvider } from '@/components/form/form-context'

export default function CommissionsPageAdd() {
    return (
        <DashboardContainer title="Add a new Commission" breadcrumbs>
            <FormProvider>
                <CommissionCreateEditForm />
            </FormProvider>
        </DashboardContainer>
    )
}
