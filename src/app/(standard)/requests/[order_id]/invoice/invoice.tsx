'use client'

import Link from 'next/link'
import type { ColumnDef } from '@tanstack/react-table'

import { InvoiceStatus } from '~/lib/structures'
import { format_to_currency } from '~/lib/utils'

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

    const columns: ColumnDef<(typeof request_data.invoices)[number]>[] = [
        {
            header: 'Invoice Id',
            cell: ({ row }) => (
                <div className="flex items-center gap-3">
                    <span>{row.original.stripe_id}</span>
                    <InvoiceStatusBadge status={row.original.status} />
                </div>
            )
        },
        {
            header: 'Price',
            cell: ({ row }) => <span>{format_to_currency(row.original.total)}</span>
        },
        {
            id: 'actions',
            cell: ({ row }) => {
                const invoice = row.original

                return (
                    <Button asChild variant={'outline'}>
                        <Link href={invoice.hosted_url ?? '#'}>View Invoice</Link>
                    </Button>
                )
            }
        }
    ]

    return (
        <div className="flex flex-col gap-5">
            <h1 className="text-lg font-bold">Invoices</h1>
            <Separator />

            <DataTable columns={columns} data={request_data.invoices} />
        </div>
    )
}

function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
    switch (status) {
        case InvoiceStatus.Creating:
            return <Badge variant={'default'}>Creating</Badge>
        case InvoiceStatus.Pending:
            return <Badge variant={'destructive'}>Unpaid</Badge>
        case InvoiceStatus.Paid:
            return <Badge variant={'default'}>Paid</Badge>
        case InvoiceStatus.Cancelled:
            return <Badge variant={'destructive'}>Cancelled</Badge>
    }
}
