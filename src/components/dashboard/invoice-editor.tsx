'use client'

import { InferSelectModel } from 'drizzle-orm'
import { invoice_items, invoices } from '~/server/db/schema'
import { Badge } from '~/components/ui/badge'
import { format_to_currency } from '~/lib/utils'
import { Button } from '~/components/ui/button'
import { ColumnDef } from '@tanstack/react-table'
import DataTable from '~/components/data-table'
import { InvoiceStatus } from '~/core/structures'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger
} from '~/components/ui/dialog'
import { Dispatch, SetStateAction, useState } from 'react'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { PlusCircleIcon, Trash2Icon } from 'lucide-react'

interface InvoiceItem {
    id: string | null
    name: string
    price: string
    quantity: number
}

export default function InvoiceEditor(props: {
    invoice: InferSelectModel<typeof invoices> & {
        invoice_items: InferSelectModel<typeof invoice_items>[]
    }
}) {
    const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>(
        props.invoice.invoice_items.map((item) => ({
            id: item.id,
            name: item.name,
            price: item.price,
            quantity: item.quantity
        }))
    )

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
        <div className="grid grid-cols-4 gap-5">
            <div className="col-span-3 rounded-xl bg-base-200 p-5">
                <h2 className="card-title">Invoice Items</h2>
                <div className="divider"></div>
                <DataTable
                    columns={columns}
                    data={invoiceItems.map((item, index) => ({
                        item_number: index + 1,
                        name: item.name,
                        price: format_to_currency(Number(item.price)),
                        quantity: item.quantity
                    }))}
                />
            </div>
            <div className="flex flex-col gap-5 rounded-xl bg-base-200 p-5">
                <div className="flex flex-col">
                    <h2 className="card-title">Invoice Details</h2>
                    <div className="divider"></div>
                </div>
                <div className="flex flex-row gap-5">
                    <span className="text-sm text-base-content/80">Invoice Status</span>
                    <InvoiceStatusBadge status={props.invoice.status as InvoiceStatus} />
                </div>
                <div className="flex flex-row gap-5">
                    <EditInvoice
                        invoice_items={invoiceItems}
                        setInvoiceItems={setInvoiceItems}
                    />
                    <Button>Send Invoice</Button>
                </div>
            </div>
        </div>
    )
}

function EditInvoice(props: {
    invoice_items: InvoiceItem[]
    setInvoiceItems: Dispatch<SetStateAction<InvoiceItem[]>>
}) {
    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant={'outline'}>Edit Invoice</Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader className="flex flex-row items-center justify-between">
                    <div className="flex flex-col gap-2">
                        <DialogTitle>Edit Invoice</DialogTitle>
                        <DialogDescription>
                            Make changes to the invoice here
                        </DialogDescription>
                    </div>
                    <Button
                        variant={'outline'}
                        onMouseDown={() =>
                            props.setInvoiceItems([
                                ...props.invoice_items,
                                {
                                    id: null,
                                    name: '',
                                    price: '',
                                    quantity: 1
                                }
                            ])
                        }
                    >
                        <PlusCircleIcon className="h-6 w-6" />
                    </Button>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    {props.invoice_items.map((item, index) => (
                        <div
                            key={item.id}
                            className="flex flex-col gap-5 rounded-xl bg-base-200 p-5"
                        >
                            <div className="flex flex-row items-center justify-between">
                                <h1 className="text-lg font-bold">Item {index + 1}</h1>
                                <Button variant={'destructive'}>
                                    <Trash2Icon className="h-6 w-6" />
                                </Button>
                            </div>
                            <div className="form-control">
                                <Label>Name:</Label>
                                <Input
                                    defaultValue={item.name}
                                    placeholder="Item Name"
                                    onBlur={(e) => {
                                        const items = [...props.invoice_items]

                                        items[index]!.name = e.currentTarget.value
                                        props.setInvoiceItems(props.invoice_items)
                                    }}
                                />
                            </div>
                            <div className="form-control">
                                <Label>Price:</Label>
                                <Input
                                    defaultValue={item.price}
                                    placeholder="Item Price"
                                />
                            </div>
                            <div className="form-control">
                                <Label>Quantity:</Label>
                                <Input
                                    defaultValue={item.quantity}
                                    placeholder="Item Quantity"
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
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
