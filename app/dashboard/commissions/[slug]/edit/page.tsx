import DashboardContainer from '@/components/dashboard/dashboard-container'
import CommissionAddForm from '@/components/dashboard/forms/commission-add-form'
import { FormProvider } from '@/components/form/form-context'

export default function CommissionsOverviewPage() {
    return (
        <DashboardContainer title="Edit Commission">
            <FormProvider>
                {/* <CommissionAddForm /> */}
                <h1>Hello, World!</h1>
            </FormProvider>
        </DashboardContainer>
    )
}
