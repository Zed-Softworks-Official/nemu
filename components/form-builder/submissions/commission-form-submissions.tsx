'use client'

import Loading from '@/components/loading'
import { GraphQLFetcher } from '@/core/helpers'
import { PencilIcon } from '@heroicons/react/20/solid'
import Link from 'next/link'
import useSWR from 'swr'
import CommissionFormSubmissionDisplay from './commission-form-submission-display'
import { useDashboardContext } from '@/components/navigation/dashboard/dashboard-context'

export default function CommissionFormSubmissions({ form_id }: { form_id: string }) {
    const { artistId } = useDashboardContext()
    const { data, isLoading } = useSWR(
        `{
            artist(id: "${artistId}") {
                get_form_data(form_id: "${form_id}") {
                    name
                    description
                    submissions
                    acceptedSubmissions
                    rejectedSubmissions
                    formSubmissions {
                        content
                        user {
                            name
                        }
                    }
                }
            }
        }`,
        GraphQLFetcher<{
            artist: {
                get_form_data: {
                    name: string
                    description: string
                    submissions: number
                    acceptedSubmissions: number
                    rejectedSubmissions: number
                    formSubmissions: { content: string; user: { name: string } }
                }
            }
        }>
    )

    if (isLoading) {
        return <Loading />
    }

    return (
        <>
            <div className="flex justify-between container mx-auto">
                <div>
                    <h1 className="card-title font-bold">{data?.artist.get_form_data.name}</h1>
                    <h2 className="font-bold text-base-content/80">
                        {data?.artist.get_form_data.description}
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
                                Total Requests: {data?.artist.get_form_data.submissions}
                            </h2>
                        </div>
                    </div>
                    <div className="card bg-base-100 max-w-md shadow-xl border-success border-2 mx-auto w-full">
                        <div className="card-body">
                            <h2 className="card-title pt-3">Accepted: {data?.artist.get_form_data.acceptedSubmissions}</h2>
                        </div>
                    </div>
                    <div className="card bg-base-100 max-w-md shadow-xl border-error border-2 mx-auto w-full">
                        <div className="card-body">
                            <h2 className="card-title pt-3">Rejected: {data?.artist.get_form_data.rejectedSubmissions}</h2>
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
                        {/* {data?.responses?.map((submission) => (
                            <CommissionFormSubmissionDisplay
                                submission={submission}
                                form_labels={data.form_labels!}
                            />
                        ))} */}
                    </tbody>
                </table>
            </div>
        </>
    )
}
