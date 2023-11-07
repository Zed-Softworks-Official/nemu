import { FormProvider } from '@/components/Form/FormContext'
import DashboardContainer from '@/components/Dashboard/DashboardContainer'
import PortfolioEditForm from '@/components/Dashboard/Forms/PortfolioEditForm'

export default function PortfolioItem() {
    return (
        <DashboardContainer title={`Edit Portfolio Item`}>
            <FormProvider>
                <PortfolioEditForm />
            </FormProvider>
        </DashboardContainer>
    )
}
