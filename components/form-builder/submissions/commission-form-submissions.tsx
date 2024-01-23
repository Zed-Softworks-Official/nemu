'use client'

import Loading from '@/components/loading'
import { CommissionFormsSubmissionViewResponse } from '@/core/responses'
import { Fetcher } from '@/core/helpers'
import { PencilIcon } from '@heroicons/react/20/solid'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import useSWR from 'swr'
import CommissionFormSubmissionDisplay from './commission-form-submission-display'

export default function CommissionFormSubmissions({ form_id }: { form_id: string }) {
    const { data: session } = useSession()
    const { data, isLoading } = useSWR<CommissionFormsSubmissionViewResponse>(
        `/api/artist/${`652ca785d3b8ea5347b84b55`}/forms/${form_id}/submissions`,
        Fetcher
    )
    //TODO: Fix Malformed Issue? with session user id?

    if (isLoading) {
        return <Loading />
    }

    return (
        <>
            <div className="flex justify-between container mx-auto">
                <div>
                    <h1 className="card-title font-bold">{data?.name}</h1>
                    <h2 className="font-bold text-base-content/80">
                        {data?.description}
                    </h2>
                </div>
                <div>
                    <Link
                        href={`/dashboard/forms/${form_id}`}
                        className="btn btn-primary"
                    >
                        <PencilIcon className="w-6 h-6" />
                        Edit Commission Form
                    </Link>
                </div>
            </div>
            <div className="divider"></div>
            <div className="overflow-x-auto pb-28">
                <div className="grid grid-cols-3 gap-5 w-full p-5">
                    <div className="card bg-base-100 max-w-md shadow-xl border-primary border-2 mx-auto w-full">
                        <div className="card-body">
                            <h2 className="card-title pt-3">
                                Total Requests: {data?.submissions}
                            </h2>
                        </div>
                    </div>
                    <div className="card bg-base-100 max-w-md shadow-xl border-success border-2 mx-auto w-full">
                        <div className="card-body">
                            <h2 className="card-title pt-3">Accepted: 0</h2>
                        </div>
                    </div>
                    <div className="card bg-base-100 max-w-md shadow-xl border-error border-2 mx-auto w-full">
                        <div className="card-body">
                            <h2 className="card-title pt-3">Rejected: 0</h2>
                        </div>
                    </div>
                </div>
                <div className="divider"></div>
                <table className="table table-zebra bg-base-100">
                    <thead>
                        <tr>
                            <th>Username</th>
                            <th>Date Submitted</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data?.responses?.map((submission) => (
                            <CommissionFormSubmissionDisplay
                                submission={submission}
                                form_labels={data.form_labels!}
                            />
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    )
}
