'use client'

import Link from 'next/link'
import type { ColumnDef } from '@tanstack/react-table'

import Loading from '~/components/ui/loading'
import { DataTable } from '~/components/data-table'

import { InvoiceStatus } from '~/core/structures'
import { api } from '~/trpc/react'

import { format_to_currency } from '~/lib/utils'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'

export default function Invoice(props: { order_id: string }) {
    const { data: request, isLoading } = api.request.get_request_by_id.useQuery({
        order_id: props.order_id
    })

    if (isLoading) {
        return <Loading />
    }

    if (!request?.invoice) {
        return <div>No invoice found</div>
    }

    const columns: ColumnDef<{
        item_number: number
        name: string
        price: string
        quantity: number
    }>[] = [
        {
            accessorKey: 'item_number',
            header: 'Item Number'
        },
        {
            accessorKey: 'name',
            header: 'Name'
        },
        {
            accessorKey: 'price',
            header: 'Price'
        },
        {
            accessorKey: 'quantity',
            header: 'Quantity'
        }
    ]

    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-row gap-3">
                <span className="text-sm">Invoice Status</span>
                <InvoiceStatusBadge status={request.invoice.status as InvoiceStatus} />
            </div>
            <DataTable
                columns={columns}
                data={request.invoice.invoice_items.map((item, index) => ({
                    item_number: index + 1,
                    name: item.name,
                    price: format_to_currency(Number(item.price / 100)),
                    quantity: item.quantity
                }))}
            />
            <div className="flex w-full gap-2">
                <div className="flex w-full justify-end">
                    <div className="flex flex-col gap-1">
                        <div className="text-xl text-muted-foreground">Total</div>
                        <div className="text-lg font-bold">
                            {format_to_currency(Number(request.invoice.total))}
                        </div>
                        {request.invoice.sent && request.invoice.hosted_url && (
                            <div className="pt-4">
                                <Button asChild>
                                    <Link
                                        href={request.invoice.hosted_url}
                                        target="_blank"
                                    >
                                        View Invoice
                                    </Link>
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )

    return <div>Invoice</div>
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
