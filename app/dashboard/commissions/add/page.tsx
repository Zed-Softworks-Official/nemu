import DashboardContainer from '@/components/dashboard/dashboard-container'
import CommissionAddForm from '@/components/dashboard/forms/commission-add-form'
import { FormProvider } from '@/components/form/form-context'

export default function CommissionsPageAdd() {
    return (
        <DashboardContainer title="Add a new Commission" breadcrumbs>
            <FormProvider>
                <CommissionAddForm />
            </FormProvider>
        </DashboardContainer>
    )
}
