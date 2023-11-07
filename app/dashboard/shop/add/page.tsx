import { FormProvider } from '@/components/Form/FormContext'
import ShopAddForm from '@/components/Dashboard/Forms/ShopAddForm'
import DashboardContainer from '@/components/Dashboard/DashboardContainer'

export default function ShopAdd() {
    return (
        <DashboardContainer title="Add to Artist's Corner">
            <FormProvider>
                <ShopAddForm />
            </FormProvider>
        </DashboardContainer>
    )
}
