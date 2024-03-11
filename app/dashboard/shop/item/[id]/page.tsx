import DashboardContainer from '@/components/dashboard/dashboard-container'
import ShopFormDataFetcher from '@/components/dashboard/forms/shop-form-data-fetcher'
import { FormProvider } from '@/components/form/form-context'

export default function ShopItemEdit({ params }: { params: { id: string } }) {
    return (
        <DashboardContainer title="Edit Artist's Corner Product">
            <FormProvider>
                <ShopFormDataFetcher product_id={params.id} />
            </FormProvider>
        </DashboardContainer>
    )
}
