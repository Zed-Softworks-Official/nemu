'use client'

import Link from 'next/link'

import { type InvoiceStatus } from '~/lib/types'
import { formatToCurrency } from '~/lib/utils'

import { DataTable } from '~/components/data-table'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { useOrder } from '~/components/orders/standard-order'
import { Separator } from '~/components/ui/separator'

export default function Invoice() {
    const { request_data } = useOrder()

    if (!request_data?.invoices) {
        return <div>No invoice found</div>
    }

    return (
        <div className="flex flex-col gap-5">
            <h1 className="text-lg font-bold">Invoices</h1>
            <Separator />

            <DataTable
                columnDefs={[
                    {
                        headerName: 'Invoice Id',
                        field: 'stripeId',
                        flex: 1,
                        cellRenderer: ({
                            data
                        }: {
                            data: (typeof request_data.invoices)[number]
                        }) => (
                            <div className="flex items-center gap-3">
                                <span>{data.stripeId}</span>
                                <InvoiceStatusBadge status={data.status} />
                            </div>
                        )
                    },
                    {
                        headerName: 'Price',
                        field: 'total',
                        cellRenderer: ({
                            data
                        }: {
                            data: (typeof request_data.invoices)[number]
                        }) => <span>{formatToCurrency(data.total / 100)}</span>
                    },
                    {
                        headerName: 'Actions',
                        field: 'hostedUrl',
                        flex: 1,
                        cellRenderer: ({
                            data
                        }: {
                            data: (typeof request_data.invoices)[number]
                        }) => {
                            const invoice = data

                            if (!invoice.hostedUrl) {
                                return null
                            }

                            return (
                                <Button asChild variant={'outline'} size={'sm'}>
                                    <Link href={invoice.hostedUrl} target="_blank">
                                        View Invoice
                                    </Link>
                                </Button>
                            )
                        }
                    }
                ]}
                rowData={request_data.invoices}
            />
        </div>
    )
}

function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
    switch (status) {
        case 'creating':
            return <Badge variant={'default'}>Creating</Badge>
        case 'pending':
            return <Badge variant={'destructive'}>Unpaid</Badge>
        case 'paid':
            return <Badge variant={'default'}>Paid</Badge>
        case 'cancelled':
            return <Badge variant={'destructive'}>Cancelled</Badge>
    }
}
