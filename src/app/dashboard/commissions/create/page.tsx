import CommissionCreateEditForm from '~/components/dashboard/forms/commission-create-edit'
import UploadThingProvider from '~/components/files/uploadthing-context'
import DashboardContainer from '~/components/ui/dashboard-container'

export default function CreateCommissionPage() {
    return (
        <DashboardContainer title="Create A New Commission">
            <UploadThingProvider endpoint="commissionImageUploader">
                <CommissionCreateEditForm />
            </UploadThingProvider>
        </DashboardContainer>
    )
}
