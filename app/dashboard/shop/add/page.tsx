import { FormProvider } from '@/components/form/form-context'
import ShopAddForm from '@/components/Dashboard/forms/shop-add-form'
import DashboardContainer from '@/components/Dashboard/dashboard-container'

export default function ShopAdd() {
    return (
        <DashboardContainer title="Add to Artist's Corner">
            <FormProvider>
                <ShopAddForm />
            </FormProvider>
        </DashboardContainer>
    )
}
