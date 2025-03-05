import { notFound } from 'next/navigation'

import { UpdateForm } from '~/app/dashboard/commissions/form'
import { Separator } from '~/components/ui/separator'
import { api } from '~/trpc/server'

export default async function CommissionUpdatePage(props: {
    params: Promise<{ id: string }>
}) {
    const params = await props.params

    const commission = await api.commission.getCommissionByIdDashboard({
        id: params.id
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

            <UpdateForm commission={commission} />
        </div>
    )
}
