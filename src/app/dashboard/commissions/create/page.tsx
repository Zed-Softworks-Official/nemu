import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { currentUser } from '@clerk/nextjs/server'
import { toast } from 'sonner'

import Loading from '~/components/ui/loading'
import UploadThingProvider from '~/components/files/uploadthing-context'
import { get_form_list } from '~/server/db/query'
import { Label } from '~/components/ui/label'
import { Input } from '~/components/ui/input'
import { Textarea } from '~/components/ui/textarea'
import { Separator } from '~/components/ui/separator'
import NemuUploadThing from '~/components/files/nemu-uploadthing'

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

    return (
        <form className="mx-auto flex flex-col gap-5">
            <div className="form-control">
                <Label className="label">Title:</Label>
                <Input placeholder="My Commission Title" />
            </div>
            <div className="form-control">
                <Label className="Description">Description:</Label>
                <Textarea placeholder="My Commission Description" />
            </div>
            <div className="form-control">
                <Label className="label">Price:</Label>
                <Input placeholder="Price" inputMode="numeric" />
            </div>
            <Separator />
            <div className="form-control">User Form:</div>
            <div className="form-control">Availability:</div>
            <div className="form-control">
                <Label className="label">Commissions Until Auto Waitlist:</Label>
                <Input placeholder="0" inputMode="numeric" />
            </div>
            <div className="form-control">
                <Label className="label">Commissions Until Auto Close:</Label>
                <Input placeholder="0" inputMode="numeric" />
            </div>
            <Separator />
            <NemuUploadThing />
            <Separator />
            <p className="text-base-content/80">
                <i>
                    Note: Commissions will need to be published. Make sure you have //
                    created the commission form for users to fill out upon a request. //{' '}
                </i>
            </p>
        </form>
    )
}

// async function PageContent() {
//     const user = await currentUser()
//     const forms = await get_form_list(user!.privateMetadata.artist_id as string)

//     if (!forms) {
//         toast.info('No forms found, please create a form first!')
//         return redirect('/dashboard/forms/create')
//     }

//     return <CommissionCreateEditForm forms={forms} />
// }
