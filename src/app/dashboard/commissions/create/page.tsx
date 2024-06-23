import { currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { toast } from 'sonner'
import CommissionCreateEditForm from '~/components/dashboard/forms/commission-create-edit'
import UploadThingProvider from '~/components/files/uploadthing-context'
import DashboardContainer from '~/components/ui/dashboard-container'
import Loading from '~/components/ui/loading'
import { get_form_list } from '~/server/db/query'

export default function CreateCommissionPage() {
    return (
        <DashboardContainer title="Create A New Commission">
            <UploadThingProvider endpoint="commissionImageUploader">
                <Suspense fallback={<Loading />}>
                    <PageContent />
                </Suspense>
            </UploadThingProvider>
        </DashboardContainer>
    )
}

async function PageContent() {
    const user = await currentUser()
    const forms = await get_form_list(user!.privateMetadata.artist_id as string)

    if (!forms) {
        toast.info('No forms found, please create a form first!')
        return redirect('/dashboard/forms/create')
    }

    return <CommissionCreateEditForm forms={forms} />
}
