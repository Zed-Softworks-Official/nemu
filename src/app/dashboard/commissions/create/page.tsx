import { currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import CommissionCreateEditForm from '~/components/dashboard/forms/commission-create-edit'
import UploadThingProvider from '~/components/files/uploadthing-context'
import DashboardContainer from '~/components/ui/dashboard-container'
import { api } from '~/trpc/server'

export default async function CreateCommissionPage() {
    const user = await currentUser()

    const forms = await api.form.get_form_list({
        artist_id: user?.privateMetadata.artist_id as string
    })

    return (
        <DashboardContainer title="Create A New Commission">
            <UploadThingProvider endpoint="commissionImageUploader">
                <CommissionCreateEditForm forms={forms} />
            </UploadThingProvider>
        </DashboardContainer>
    )
}
