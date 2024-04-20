import { redirect } from 'next/navigation'
import CommissionCreateEditForm from '~/components/dashboard/forms/commission-create-edit'
import UploadThingProvider from '~/components/files/uploadthing-context'
import DashboardContainer from '~/components/ui/dashboard-container'
import { getServerAuthSession } from '~/server/auth'
import { api } from '~/trpc/server'

export default async function CreateCommissionPage() {
    const session = await getServerAuthSession()

    if (!session || !session.user.artist_id) {
        return redirect('/u/login')
    }

    const forms = await api.form.get_form_list({ artist_id: session.user.artist_id })

    return (
        <DashboardContainer title="Create A New Commission">
            <UploadThingProvider endpoint="commissionImageUploader">
                <CommissionCreateEditForm forms={forms} />
            </UploadThingProvider>
        </DashboardContainer>
    )
}
