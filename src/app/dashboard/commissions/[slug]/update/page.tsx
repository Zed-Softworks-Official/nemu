import { notFound, redirect } from 'next/navigation'

import CommissionCreateEditForm from '~/components/dashboard/forms/commission-create-edit'
import UploadThingProvider from '~/components/files/uploadthing-context'
import DashboardContainer from '~/components/ui/dashboard-container'
import { getServerAuthSession } from '~/server/auth'
import { api } from '~/trpc/server'

export default async function UpdateCommissionPage({
    params
}: {
    params: { slug: string }
}) {
    const session = await getServerAuthSession()

    if (!session || !session.user.artist_id || !session.user.handle) {
        return redirect('/u/login')
    }

    const forms = await api.form.get_form_list({ artist_id: session.user.artist_id })
    const edit_data = await api.commission.get_commission({
        slug: params.slug,
        handle: session.user.handle,
        req_data: {
            edit_data: true
        }
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
