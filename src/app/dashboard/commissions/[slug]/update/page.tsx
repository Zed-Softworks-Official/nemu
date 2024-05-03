import { currentUser } from '@clerk/nextjs/server'
import { notFound, redirect } from 'next/navigation'

import CommissionCreateEditForm from '~/components/dashboard/forms/commission-create-edit'
import UploadThingProvider from '~/components/files/uploadthing-context'
import DashboardContainer from '~/components/ui/dashboard-container'
import { api } from '~/trpc/server'

export default async function UpdateCommissionPage({
    params
}: {
    params: { slug: string }
}) {
    const user = await currentUser()

    if (!user) {
        return redirect('/u/login')
    }

    const forms = await api.form.get_form_list({
        artist_id: user?.privateMetadata.artist_id as string
    })

    const edit_data = await api.commission.get_commission_edit({
        slug: params.slug
    })

    if (!edit_data) {
        return notFound()
    }

    return (
        <DashboardContainer title={`Update ${edit_data?.title}`}>
            <UploadThingProvider
                endpoint="commissionImageUploader"
                edit_previews={edit_data?.images}
            >
                <CommissionCreateEditForm forms={forms} edit_data={edit_data} />
            </UploadThingProvider>
        </DashboardContainer>
    )
}
