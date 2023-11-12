import { FormProvider } from '@/components/form/form-context'
import DashboardContainer from '@/components/dashboard/dashboard-container'
import PortfolioEditForm from '@/components/dashboard/forms/portfolio-edit-form'

export default function PortfolioItem() {
    return (
        <DashboardContainer title={`Edit Portfolio Item`}>
            <FormProvider>
                <PortfolioEditForm />
            </FormProvider>
        </DashboardContainer>
    )
}
