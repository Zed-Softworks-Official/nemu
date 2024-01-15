'use client'

import Loading from '@/components/loading'
import { CommissionFormsResponse } from '@/helpers/api/request-inerfaces'
import { fetcher } from '@/helpers/fetcher'
import { PencilIcon } from '@heroicons/react/20/solid'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import useSWR from 'swr'

export default function CommissionFormSubmissions({ form_id }: { form_id: string }) {
    const { data: session } = useSession()
    const { data, isLoading } = useSWR<CommissionFormsResponse>(
        `/api/artist/${session?.user.user_id}/forms/${form_id}`,
        fetcher
    )

    if (isLoading) {
        return <Loading />
    }

    return (
        <>
            <div className="flex justify-between container mx-auto">
                <div>
                    <h1 className="card-title font-bold">{data?.form?.name}</h1>
                    <h2 className="font-bold text-base-content/80">
                        {data?.form?.description}
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
            <div className="overflow-x-auto min-h-[20rem]">
                <table className="table table-zebra">
                    <thead>
                        <tr>
                            <th>Username</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data?.form?.formSubmissions.map((submission) => (
                            <tr>
                                <th>
                                    <div className="badge badge-primary badge-xs mr-2"></div>
                                    {submission.userId}
                                </th>
                                <td>
                                    <div className="dropdown">
                                        <div
                                            tabIndex={0}
                                            role="button"
                                            className="btn btn-primary"
                                        >
                                            View Actions
                                        </div>
                                        <ul
                                            tabIndex={0}
                                            className="p-2 shadow menu dropdown-content z-[1] bg-base-100 rounded-xl w-52"
                                        >
                                            <li>
                                                <a>View Submission</a>
                                            </li>
                                            <li>
                                                <a>Accept</a>
                                            </li>
                                            <li>
                                                <a>Reject</a>
                                            </li>
                                        </ul>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    )
}
