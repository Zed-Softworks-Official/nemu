'use client'

import DashboardContainer from '@/components/dashboard/dashboard-container'

import CommissionCreateForm from '@/components/dashboard/forms/commission-form-create-form'
import { useDashboardContext } from '@/components/navigation/dashboard/dashboard-context'
import Loading from '@/components/loading'
import Link from 'next/link'
import { PencilSquareIcon } from '@heroicons/react/20/solid'
import { api } from '@/core/trpc/react'

export default function DashboardForms() {
    const { artist } = useDashboardContext()!
    const { data, isLoading, refetch } = api.form.get_forms.useQuery({
        artist_id: artist?.id!
    })

    if (isLoading) {
        return <Loading />
    }

    return (
        <DashboardContainer
            title="Forms"
            modal={<CommissionCreateForm refetch={refetch} />}
        >
            <div className="max-w-6xl mx-auto">
                <div className="grid grid-cols-3 gap-5">
                    {data?.map((form) => (
                        <div className="card bg-base-100 shadow-xl" key={form.id}>
                            <div className="card-body">
                                <h2 className="card-title">{form.name}</h2>
                                <p>{form.description}</p>
                                <div className="card-actions justify-end pt-5">
                                    <Link
                                        className="btn btn-primary"
                                        href={`/dashboard/forms/${form.id}`}
                                    >
                                        <PencilSquareIcon className="w-6 h-6" />
                                        Edit
                                    </Link>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </DashboardContainer>
    )
}
