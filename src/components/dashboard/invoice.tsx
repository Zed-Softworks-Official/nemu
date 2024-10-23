'use client'

import { type Dispatch, type SetStateAction, useState, useCallback } from 'react'
import type { InferSelectModel } from 'drizzle-orm'
import { Edit, Save, Trash2 } from 'lucide-react'

import { type InvoiceItem, InvoiceStatus } from '~/core/structures'
import type { invoice_items, invoices } from '~/server/db/schema'
import { format_to_currency } from '~/lib/utils'

import { Badge } from '~/components/ui/badge'
import {
    Table,
    TableBody,
    TableCell,
    TableFooter,
    TableHead,
    TableHeader,
    TableRow
} from '~/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { Button } from '~/components/ui/button'
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle
} from '~/components/ui/alert-dialog'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { createId } from '@paralleldrive/cuid2'

type InvoiceProps = {
    invoice: InferSelectModel<typeof invoices> & {
        invoice_items: InferSelectModel<typeof invoice_items>[]
    }
}

export default function InvoiceDisplay(props: InvoiceProps | undefined) {
    if (!props) return null

    return <InvoiceEditor invoice={props.invoice} />
}

function InvoiceEditor(props: InvoiceProps) {
    const [selectedInvoiceItem, setSelectedInvoiceItem] = useState<
        InvoiceItem | undefined
    >(undefined)
    const [dialogOpen, setDialogOpen] = useState(false)
    const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>(
        props.invoice?.invoice_items.map((item) => ({
            id: item.id,
            name: item.name,
            price: Number(item.price / 100),
            quantity: item.quantity
        }))
    )

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            Invoice
                            <InvoiceStatusBadge
                                status={props.invoice.status as InvoiceStatus}
                            />
                        </div>
                        <div>
                            <Button>
                                <Save className="h-5 w-5" />
                            </Button>
                        </div>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Item Number</TableHead>
                                <TableHead>Name</TableHead>
                                <TableHead>Price</TableHead>
                                <TableHead>Quantity</TableHead>
                                <TableHead>Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {invoiceItems.map((item, index) => (
                                <TableRow key={item.id}>
                                    <TableCell>{index + 1}</TableCell>
                                    <TableCell>{item.name}</TableCell>
                                    <TableCell>{item.price}</TableCell>
                                    <TableCell>{item.quantity}</TableCell>
                                    <TableCell className="flex items-center gap-3">
                                        <Button
                                            variant={'outline'}
                                            onClick={() => {
                                                setSelectedInvoiceItem(item)
                                                setDialogOpen(true)
                                            }}
                                        >
                                            <Edit className="h-5 w-5" />
                                        </Button>
                                        <Button
                                            variant={'destructive'}
                                            onClick={() => {
                                                setInvoiceItems((prev) =>
                                                    prev.filter(
                                                        (value) => value.id !== item.id
                                                    )
                                                )
                                            }}
                                        >
                                            <Trash2 className="h-5 w-5" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                        <TableFooter>
                            <TableRow>
                                <TableCell colSpan={4}>Total</TableCell>
                                <TableCell>
                                    {format_to_currency(props.invoice.total)}
                                </TableCell>
                            </TableRow>
                        </TableFooter>
                    </Table>
                </CardContent>
            </Card>
            <InvoiceModal
                open={dialogOpen}
                setOpen={setDialogOpen}
                invoice_item={selectedInvoiceItem}
                update_func={() => console.log('updated')}
            />
        </>
    )
}

function InvoiceModal(props: {
    invoice_item: InvoiceItem | undefined
    open: boolean
    setOpen: Dispatch<SetStateAction<boolean>>
    update_func: () => void
}) {
    const [invoiceItem, setInvoiceItem] = useState<InvoiceItem | undefined>(
        props.invoice_item
    )

    const init_new_item = useCallback(() => {
        return {
            id: createId(),
            name: '',
            price: 0,
            quantity: 1
        }
    }, [])

    return (
        <AlertDialog open={props.open}>
            <AlertDialogContent className="bg-base-200">
                <AlertDialogHeader>
                    <AlertDialogTitle>
                        {invoiceItem !== undefined ? 'Edit' : 'Create'} Invoice Item
                    </AlertDialogTitle>
                </AlertDialogHeader>
                <div className="form-control gap-3">
                    <Label className="label">Name:</Label>
                    <Input
                        placeholder="Item Name"
                        defaultValue={invoiceItem?.name}
                        onChange={(e) => {
                            if (!invoiceItem) {
                                init_new_item()
                            }

                            setInvoiceItem({
                                ...invoiceItem!,
                                name: e.currentTarget.value
                            })
                        }}
                    />
                </div>
                <div className="form-control gap-3">
                    <Label className="label">Price:</Label>
                    <Input
                        placeholder="Item Price"
                        defaultValue={invoiceItem?.price}
                        onChange={(e) => {
                            if (!invoiceItem) {
                                init_new_item()
                            }

                            setInvoiceItem({
                                ...invoiceItem!,
                                price: Number(e.currentTarget.value)
                            })
                        }}
                        type="number"
                        inputMode="numeric"
                    />
                </div>
                <div className="form-control gap-3">
                    <Label className="label">Quantity:</Label>
                    <Input
                        placeholder="Item Quantity"
                        defaultValue={invoiceItem?.quantity}
                        onChange={(e) => {
                            if (!invoiceItem) {
                                init_new_item()
                            }

                            setInvoiceItem({
                                ...invoiceItem!,
                                quantity: Number(e.currentTarget.value)
                            })
                        }}
                        type="number"
                        inputMode="numeric"
                    />
                </div>
                <div className="flex justify-end">
                    <Button
                        onClick={() => {
                            props.setOpen(false)
                            props.update_func()
                        }}
                        className="btn-wide"
                    >
                        {invoiceItem !== undefined ? 'Update' : 'Create'}
                    </Button>
                </div>
            </AlertDialogContent>
        </AlertDialog>
    )
}

function InvoiceStatusBadge(props: { status: InvoiceStatus }) {
    switch (props.status) {
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
