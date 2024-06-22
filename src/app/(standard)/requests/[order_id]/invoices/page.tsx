import type { ColumnDef } from '@tanstack/react-table'
import Link from 'next/link'
import { Suspense } from 'react'
import DataTable from '~/components/data-table'
import { Badge } from '~/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import Loading from '~/components/ui/loading'
import { InvoiceStatus } from '~/core/structures'
import { format_to_currency } from '~/lib/utils'
import { get_request_details } from '~/server/db/query'

export default function RequestInvoicesPage({
    params
}: {
    params: { order_id: string }
}) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Invoice</CardTitle>
            </CardHeader>
            <CardContent>
                <Suspense fallback={<Loading />}>
                    <InvoiceDataTable order_id={params.order_id} />
                </Suspense>
            </CardContent>
        </Card>
    )
}

async function InvoiceDataTable(props: { order_id: string }) {
    const invoice = (await get_request_details(props.order_id))?.invoice

    if (!invoice) {
        return <>No Invoice</>
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
                <span className="text-sm text-base-content/60">Invoice Status</span>
                <InvoiceStatusBadge status={invoice.status as InvoiceStatus} />
            </div>
            <DataTable
                columns={columns}
                data={invoice.invoice_items.map((item, index) => ({
                    item_number: index + 1,
                    name: item.name,
                    price: format_to_currency(Number(item.price)),
                    quantity: item.quantity
                }))}
            />
            <div className="stats w-full justify-end shadow">
                <div className="stat justify-end">
                    <div className="stat-title">Total</div>
                    <div className="stat-value">
                        {format_to_currency(Number(invoice.total))}
                    </div>
                    {invoice.sent && invoice.hosted_url && (
                        <div className="stat-actions">
                            <Link
                                href={invoice.hosted_url}
                                target="_blank"
                                className="btn btn-primary btn-sm text-white"
                            >
                                View Invoice
                            </Link>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
    switch (status) {
        case InvoiceStatus.Creating:
            return <Badge variant={'warning'}>Creating</Badge>
        case InvoiceStatus.Pending:
            return <Badge variant={'destructive'}>Unpaid</Badge>
        case InvoiceStatus.Paid:
            return <Badge variant={'success'}>Paid</Badge>
        case InvoiceStatus.Cancelled:
            return <Badge variant={'destructive'}>Cancelled</Badge>
    }
}
