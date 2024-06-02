'use client'

import { InferSelectModel } from 'drizzle-orm'
import { invoice_items, invoices } from '~/server/db/schema'
import { Badge } from '~/components/ui/badge'
import { format_to_currency } from '~/lib/utils'
import { Button } from '~/components/ui/button'
import { ColumnDef } from '@tanstack/react-table'
import DataTable from '~/components/data-table'
import debounce from 'lodash.debounce'
import { InvoiceItem, InvoiceStatus } from '~/core/structures'

import { Dispatch, SetStateAction, useCallback, useState } from 'react'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { PlusCircleIcon, Trash2Icon } from 'lucide-react'
import {
    AlertDialog,
    AlertDialogHeader,
    AlertDialogTrigger,
    AlertDialogContent,
    AlertDialogTitle,
    AlertDialogFooter,
    AlertDialogCancel,
    AlertDialogAction,
    AlertDialogDescription
} from '~/components/ui/alert-dialog'
import { api } from '~/trpc/react'
import { toast } from 'sonner'

export default function InvoiceEditor(props: {
    invoice: InferSelectModel<typeof invoices> & {
        invoice_items: InferSelectModel<typeof invoice_items>[]
    }
}) {
    const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>(
        props.invoice.invoice_items.map((item) => ({
            id: item.id,
            name: item.name,
            price: Number(item.price),
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
                    <EditInvoiceModel
                        invoice_items={invoiceItems}
                        setInvoiceItems={setInvoiceItems}
                        invoice_id={props.invoice.id}
                    />
                    <SendInvoiceButton
                        invoice_id={props.invoice.id}
                        invoice_items={invoiceItems}
                    />
                </div>
            </div>
        </div>
    )
}

function EditInvoiceModel(props: {
    invoice_id: string
    invoice_items: InvoiceItem[]
    setInvoiceItems: Dispatch<SetStateAction<InvoiceItem[]>>
}) {
    const [toastId, setToastId] = useState<string | number | null>(null)
    const [editableInvoiceItems, setEditableInvoiceItems] = useState<InvoiceItem[]>(
        props.invoice_items
    )

    const mutation = api.invoice.update_invoice_items.useMutation({
        onMutate: () => {
            setToastId(toast.loading('Updating invoice'))
        },
        onSuccess: () => {
            if (!toastId) return

            toast.success('Invoice Updated', {
                id: toastId
            })
        },
        onError: (e) => {
            if (!toastId) return

            toast.error(e.message, {
                id: toastId
            })
        }
    })

    const debounceInput = useCallback(
        debounce(
            (
                index: number,
                opts:
                    | ({ field: 'name' | 'price' | 'quantity' } & {
                          field: 'name'
                          value: string
                      })
                    | { field: 'price'; value: number }
                    | { field: 'quantity'; value: number }
            ) => {
                const items = [...editableInvoiceItems]

                if (opts.field === 'name') {
                    editableInvoiceItems[index]!.name = opts.value
                } else if (opts.field === 'price') {
                    editableInvoiceItems[index]!.price = opts.value
                } else if (opts.field === 'quantity') {
                    editableInvoiceItems[index]!.quantity = opts.value
                }

                setEditableInvoiceItems(items)
            },
            300
        ),
        [editableInvoiceItems]
    )

    return (
        <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button variant={'outline'}>Edit Invoice</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader className="flex flex-row items-center justify-between">
                    <div className="flex flex-col gap-2">
                        <AlertDialogTitle>Edit Invoice</AlertDialogTitle>
                        <AlertDialogDescription>
                            Make changes to the invoice here
                        </AlertDialogDescription>
                    </div>
                    <Button
                        variant={'outline'}
                        onMouseDown={() =>
                            setEditableInvoiceItems([
                                ...editableInvoiceItems,
                                {
                                    id: null,
                                    name: '',
                                    price: 0,
                                    quantity: 1
                                }
                            ])
                        }
                    >
                        <PlusCircleIcon className="h-6 w-6" />
                    </Button>
                </AlertDialogHeader>
                <div className="grid gap-4 overflow-auto py-4">
                    {editableInvoiceItems.map((item, index) => (
                        <div
                            key={item.id}
                            className="flex flex-col gap-5 rounded-xl bg-base-200 p-5"
                        >
                            <div className="flex flex-row items-center justify-between">
                                <h1 className="text-lg font-bold">Item {index + 1}</h1>
                                <Button
                                    variant={'destructive'}
                                    onMouseDown={() => {
                                        setEditableInvoiceItems(() => {
                                            const items = editableInvoiceItems.filter(
                                                (_, item_index) => item_index !== index
                                            )

                                            return items
                                        })
                                    }}
                                >
                                    <Trash2Icon className="h-6 w-6" />
                                </Button>
                            </div>
                            <div className="form-control">
                                <Label>Name:</Label>
                                <Input
                                    defaultValue={item.name}
                                    placeholder="Item Name"
                                    onChange={(e) =>
                                        debounceInput(index, {
                                            field: 'name',
                                            value: e.currentTarget.value
                                        })
                                    }
                                />
                            </div>
                            <div className="form-control">
                                <Label>Price:</Label>
                                <Input
                                    defaultValue={item.price}
                                    placeholder="Item Price"
                                    onChange={(e) =>
                                        debounceInput(index, {
                                            field: 'price',
                                            value: Number(e.currentTarget.value)
                                        })
                                    }
                                />
                            </div>
                            <div className="form-control">
                                <Label>Quantity:</Label>
                                <Input
                                    defaultValue={item.quantity}
                                    placeholder="Item Quantity"
                                    onChange={(e) =>
                                        debounceInput(index, {
                                            field: 'quantity',
                                            value: Number(e.currentTarget.value)
                                        })
                                    }
                                />
                            </div>
                        </div>
                    ))}
                </div>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onMouseDown={() => {
                            props.setInvoiceItems(editableInvoiceItems)
                            mutation.mutate({
                                invoice_id: props.invoice_id,
                                items: editableInvoiceItems
                            })
                        }}
                    >
                        Update Invoice
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}

function SendInvoiceButton(props: { invoice_id: string; invoice_items: InvoiceItem[] }) {
    const [toastId, setToastId] = useState<string | number | undefined>(undefined)
    const mutation = api.invoice.send_invoice.useMutation({
        onMutate: () => {
            setToastId(toast.loading('Sending Invoice'))
        },
        onSuccess: () => {
            if (!toastId) return

            toast.success('Invoice sent!', {
                id: toastId
            })
        },
        onError: (e) => {
            if (!toastId) return

            toast.error(e.message, {
                id: toastId
            })
        }
    })

    return (
        <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button>Send Invoice</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This will send the invoice to the client, there is no undo so make
                        sure everything is correct before sending.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onMouseDown={() => {}}>
                        Send Invoice
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
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
