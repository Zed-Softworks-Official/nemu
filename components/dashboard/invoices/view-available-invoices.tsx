'use client'

import Loading from '@/components/loading'
import { GraphQLFetcher } from '@/core/helpers'
import { PaymentStatus } from '@/core/structures'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import useSWR from 'swr'

export default function ViewAvailableInvoices() {
    const { data: session } = useSession()
    const { data, isLoading } = useSWR(
        `{
            form_submissions(user_id: "${session?.user.user_id}") {
                paymentStatus
                invoiceHostedUrl
                invoiceSent
                form {
                    commission {
                        title
                        artist {
                            handle
                        }
                    }
                }
            }
        }`,
        GraphQLFetcher<{
            form_submissions: {
                paymentStatus: PaymentStatus
                invoiceHostedUrl?: string
                invoiceSent: boolean
                form: {
                    commission: {
                        title: string
                        artist: {
                            handle: string
                        }
                    }
                }
            }[]
        }>
    )

    if (isLoading) {
        return <Loading />
    }

    return (
        <>
            {data?.form_submissions.length == 0 ? (
                <div className="flex w-full h-full justify-center items-center">
                    <h2 className="card-title text-base-content/80">No Invoices Here Yet</h2>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="table table-zebra bg-base-100">
                        <thead>
                            <tr>
                                <th>Commission Title</th>
                                <th>Artist</th>
                                <th>Payment Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data?.form_submissions.map((submission) => (
                                <>
                                    {submission.invoiceSent && (
                                        <tr>
                                            <th>{submission.form.commission.title}</th>
                                            <td>{submission.form.commission.artist.handle}</td>
                                            <td>
                                                {submission.paymentStatus == PaymentStatus.InvoiceNeedsPayment ? (
                                                    <span className="badge badge-error badge-lg">Unpaid</span>
                                                ) : (
                                                    submission.paymentStatus == PaymentStatus.Captured && (
                                                        <span className="badge badge-success badge-lg">Paid</span>
                                                    )
                                                )}
                                            </td>
                                            <td>
                                                <Link href={submission.invoiceHostedUrl || '#'} target="_blank" className="btn btn-primary">
                                                    {submission.paymentStatus == PaymentStatus.InvoiceNeedsPayment
                                                        ? 'Pay Invoice'
                                                        : submission.paymentStatus == PaymentStatus.Captured && 'View Invoice'}
                                                </Link>
                                            </td>
                                        </tr>
                                    )}
                                </>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </>
    )
}
