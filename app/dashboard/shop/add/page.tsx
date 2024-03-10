import { FormProvider } from '@/components/form/form-context'
import ShopCreateEditForm from '@/components/dashboard/forms/shop-create-edit-form'
import DashboardContainer from '@/components/dashboard/dashboard-container'

export default function ShopAdd() {
    return (
        <DashboardContainer title="Add to Artist's Corner">
            <FormProvider>
                <ShopCreateEditForm />
            </FormProvider>
        </DashboardContainer>
    )
}
