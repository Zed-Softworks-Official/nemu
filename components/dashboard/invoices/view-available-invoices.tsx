'use client'

import Loading from '@/components/loading'
import { FormatNumberToCurrency } from '@/core/helpers'
import { PaymentStatus } from '@/core/structures'
import { api } from '@/core/api/react'
import Link from 'next/link'

export default function ViewAvailableInvoices() {
    const {data, isLoading} = api.invoices.get_invoices.useQuery()

    if (isLoading) {
        return <Loading />
    }

    return (
        <>
            {data?.length == 0 ? (
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
                                <th>Amount</th>
                                <th>Payment Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data?.map((invoice) => (
                                <>
                                    {invoice.sent && (
                                        <tr>
                                            <th>{invoice.commission_data.title}</th>
                                            <td>{invoice.commission_data.artist_handle}</td>
                                            <td>{FormatNumberToCurrency(invoice.commission_data.total_price)}</td>
                                            <td>
                                                {invoice.paymentStatus == PaymentStatus.InvoiceNeedsPayment ? (
                                                    <span className="badge badge-error badge-lg">Unpaid</span>
                                                ) : (
                                                    invoice.paymentStatus == PaymentStatus.Captured && (
                                                        <span className="badge badge-success badge-lg">Paid</span>
                                                    )
                                                )}
                                            </td>
                                            <td>
                                                <Link href={invoice.hostedUrl || '#'} target="_blank" className="btn btn-primary">
                                                    {invoice.paymentStatus == PaymentStatus.InvoiceNeedsPayment
                                                        ? 'Pay Invoice'
                                                        : invoice.paymentStatus == PaymentStatus.Captured && 'View Invoice'}
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
