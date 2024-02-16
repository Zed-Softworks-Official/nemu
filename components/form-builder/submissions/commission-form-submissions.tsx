'use client'

import Loading from '@/components/loading'
import { GraphQLFetcher } from '@/core/helpers'
import useSWR from 'swr'
import CommissionFormSubmissionDisplay from './commission-form-submission-display'
import { PaymentStatus } from '@/core/structures'

export default function CommissionFormSubmissions({
    commission_id
}: {
    commission_id: string
}) {
    const { data, isLoading } = useSWR(
        `{
            commission(id: "${commission_id}") {
                useInvoicing
                get_form_data {
                    id
                    name
                    description
                    submissions
                    acceptedSubmissions
                    rejectedSubmissions
                    formSubmissions {
                        id
                        content
                        createdAt
                        paymentIntent
                        paymentStatus
                        user {
                            name
                        }
                    }
                }
                artist {
                    stripeAccount
                }
            }
        }`,
        GraphQLFetcher<{
            commission: {
                useInvoicing: boolean
                get_form_data: {
                    id: string
                    name: string
                    description: string
                    submissions: number
                    acceptedSubmissions: number
                    rejectedSubmissions: number
                    formSubmissions: {
                        id: string
                        content: string
                        createdAt: Date
                        paymentIntent: string
                        paymentStatus: PaymentStatus
                        user: { name: string }
                    }[]
                }
                artist: {
                    stripeAccount: string
                }
            }
        }>
    )

    if (isLoading) {
        return <Loading />
    }

    return (
        <div className="bg-base-300 rounded-xl">
            <div className="flex justify-between card">
                <div className="card-body">
                    <h1 className="card-title font-bold">
                        Form Used: {data?.commission.get_form_data.name}
                    </h1>
                    <h2 className="font-bold text-base-content/80">
                        Description: {data?.commission.get_form_data.description}
                    </h2>
                </div>
            </div>
            <div className="divider"></div>
            <div className="overflow-x-auto pb-28">
                <div className="grid grid-cols-3 gap-5 w-full p-5">
                    <div className="card bg-base-100 max-w-md shadow-xl border-primary border-2 mx-auto w-full">
                        <div className="card-body">
                            <h2 className="card-title pt-3">
                                New Requests: {data?.commission.get_form_data.submissions}
                            </h2>
                        </div>
                    </div>
                    <div className="card bg-base-100 max-w-md shadow-xl border-success border-2 mx-auto w-full">
                        <div className="card-body">
                            <h2 className="card-title pt-3">
                                Accepted:{' '}
                                {data?.commission.get_form_data.acceptedSubmissions}
                            </h2>
                        </div>
                    </div>
                    <div className="card bg-base-100 max-w-md shadow-xl border-error border-2 mx-auto w-full">
                        <div className="card-body">
                            <h2 className="card-title pt-3">
                                Rejected:{' '}
                                {data?.commission.get_form_data.rejectedSubmissions}
                            </h2>
                        </div>
                    </div>
                </div>
                <div className="divider"></div>
                <table className="table table-zebra bg-base-100 max-w-7xl mx-auto">
                    <thead>
                        <tr>
                            <th>Username</th>
                            <th>Date Submitted</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data?.commission.get_form_data.formSubmissions?.map(
                            (submission) =>
                                submission.paymentStatus ==
                                    PaymentStatus.RequiresCapture && (
                                    <CommissionFormSubmissionDisplay
                                        submission={submission}
                                        form_id={data?.commission.get_form_data.id}
                                        stripe_account={
                                            data?.commission.artist.stripeAccount
                                        }
                                        use_invoicing={data?.commission.useInvoicing}
                                    />
                                )
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
