import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { currentUser } from '@clerk/nextjs/server'
import { toast } from 'sonner'

import Loading from '~/components/ui/loading'
import UploadThingProvider from '~/components/files/uploadthing-context'
import { get_form_list } from '~/server/db/query'

import { CommissionCreateForm } from '~/components/dashboard/forms/commission-form'

export default function CreateCommissionPage() {
    return (
        <div className="container mx-auto px-5 py-10">
            <div className="mb-6 flex items-center justify-between">
                <h1 className="text-3xl font-bold">Create A New Commission</h1>
            </div>

            <UploadThingProvider endpoint="commissionImageUploader">
                <Suspense fallback={<Loading />}>
                    <CreateForm />
                </Suspense>
            </UploadThingProvider>
        </div>
    )
}

async function CreateForm() {
    const user = await currentUser()

    if (!user) {
        return redirect('/u/login')
    }

    const forms = await get_form_list(user.privateMetadata.artist_id as string)

    if (!forms) {
        toast.info('No forms found, please create a form first!')
        return redirect('/dashboard/forms/create')
    }

    return <CommissionCreateForm forms={forms} />
}
