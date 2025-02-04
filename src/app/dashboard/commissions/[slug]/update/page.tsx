import UploadThingProvider from '~/components/files/uploadthing-context'
import { UpdateForm } from '~/app/dashboard/commissions/form'
import { api } from '~/trpc/server'
import { Separator } from '~/components/ui/separator'
import { notFound } from 'next/navigation'

export default async function CommissionUpdatePage(props: {
    params: Promise<{ slug: string }>
}) {
    const params = await props.params

    const commission = await api.commission.get_commission_for_editing({
        slug: params.slug
    })

    if (!commission) {
        return notFound()
    }

    return (
        <div className="container mx-auto w-full max-w-xl">
            <div className="flex flex-row items-center justify-between pb-5">
                <h1 className="text-2xl font-bold">Update {commission.title}</h1>
            </div>
            <Separator />
            <UploadThingProvider
                endpoint="commissionImageUploader"
                edit_previews={commission.images}
            >
                <UpdateForm commission={commission} />
            </UploadThingProvider>
        </div>
    )
}
