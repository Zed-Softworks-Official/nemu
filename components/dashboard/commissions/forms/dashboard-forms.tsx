'use client'

import useSWR from 'swr'
import { fetcher } from '@/helpers/fetcher'

import { useSession } from 'next-auth/react'
import { CommissionFormsResponse } from '@/helpers/api/request-inerfaces'
import Loading from '@/components/loading'
import Link from 'next/link'

export default function DashboardFormsList() {
    const { data: session } = useSession()
    const { data, isLoading } = useSWR<CommissionFormsResponse>(
        `/api/artist/${session?.user.user_id}/forms`,
        fetcher
    )

    if (isLoading) {
        return <Loading />
    }

    return (
        <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-3 gap-5">
                {data?.forms?.map((form) => (
                    <div className="card bg-base-100 shadow-xl">
                        <div className="card-body">
                            <h2 className="card-title">{form.name}</h2>
                            <p>{form.description}</p>
                            <div className="card-actions justify-end">
                                <Link
                                    className="btn btn-primary"
                                    href={`/dashboard/forms/${form.id}`}
                                >
                                    Edit
                                </Link>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
