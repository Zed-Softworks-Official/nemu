import { FormProvider } from '@/components/Form/FormContext'
import DashboardContainer from '@/components/Dashboard/DashboardContainer'
import ShopForm from '@/components/Dashboard/Forms/ShopForm'

export default function ShopAdd() {
    return (
        <DashboardContainer title="Add to Artist's Corner">
            <FormProvider>
                <ShopForm />
            </FormProvider>
        </DashboardContainer>
    )
}
