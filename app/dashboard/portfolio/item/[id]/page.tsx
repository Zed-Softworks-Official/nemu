import { FormProvider } from '@/components/form/form-context'
import DashboardContainer from '@/components/Dashboard/dashboard-container'
import PortfolioEditForm from '@/components/Dashboard/forms/portfolio-edit-form'

export default function PortfolioItem() {
    return (
        <DashboardContainer title={`Edit Portfolio Item`}>
            <FormProvider>
                <PortfolioEditForm />
            </FormProvider>
        </DashboardContainer>
    )
}
