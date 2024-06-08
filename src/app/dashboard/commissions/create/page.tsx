import { currentUser } from '@clerk/nextjs/server'
import { eq } from 'drizzle-orm'
import { unstable_cache } from 'next/cache'
import { Suspense } from 'react'
import CommissionCreateEditForm from '~/components/dashboard/forms/commission-create-edit'
import UploadThingProvider from '~/components/files/uploadthing-context'
import DashboardContainer from '~/components/ui/dashboard-container'
import Loading from '~/components/ui/loading'
import { db } from '~/server/db'
import { forms } from '~/server/db/schema'

export const get_form_list = unstable_cache(
    async (artist_id: string) => {
        const db_forms = await db.query.forms.findMany({
            where: eq(forms.artist_id, artist_id)
        })

        if (!db_forms) {
            return undefined
        }

        return db_forms
    },
    ['forms'],
    {
        tags: ['forms']
    }
)

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

    return <CommissionCreateEditForm forms={forms} />
}
