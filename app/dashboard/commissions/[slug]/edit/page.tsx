import DashboardContainer from '@/components/dashboard/dashboard-container'
import CommissionFormDataFetcher from '@/components/dashboard/forms/commission-form-data-fetcher'
import { FormProvider } from '@/components/form/form-context'

export default function CommissionsOverviewPage({ params }: { params: { slug: string } }) {
    return (
        <DashboardContainer title="Edit Commission">
            <FormProvider>
                <CommissionFormDataFetcher slug={params.slug} />
            </FormProvider>
        </DashboardContainer>
    )
}
