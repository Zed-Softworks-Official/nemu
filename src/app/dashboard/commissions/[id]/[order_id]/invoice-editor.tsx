'use client'

import { useEffect, useState } from 'react'
import { MoreVertical, PencilIcon, Plus, Save, Send, Trash2 } from 'lucide-react'

import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createId } from '@paralleldrive/cuid2'

import { toast } from 'sonner'

import { DataTable } from '~/app/_components/data-table'
import { useDashboardOrder } from '~/app/_components/orders/dashboard-order'

import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from '~/app/_components/ui/card'
import { Button } from '~/app/_components/ui/button'

import type { InvoiceItem } from '~/lib/types'
import { formatToCurrency } from '~/lib/utils'

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger
} from '~/app/_components/ui/dialog'
import { Form, FormControl, FormItem, FormLabel } from '~/app/_components/ui/form'
import { Input } from '~/app/_components/ui/input'
import { api } from '~/trpc/react'

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger
} from '~/app/_components/ui/alert-dialog'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from '~/app/_components/ui/dropdown-menu'
import { type ColDef } from 'ag-grid-community'

export function InvoiceEditor() {
    const { currentInvoice, isDownpaymentInvoice } = useDashboardOrder()
    const [items, setItems] = useState<InvoiceItem[]>(currentInvoice?.items ?? [])

    const utils = api.useUtils()

    const updateItems = api.request.updateInvoiceItems.useMutation({
        onMutate: () => {
            const toast_id = toast.loading('Updating Invoice...')

            return { toast_id }
        },
        onError: (e, _, context) => {
            toast.error(e.message, {
                id: context?.toast_id
            })
        },
        onSuccess: (_, __, context) => {
            toast.success('Invoice updated', {
                id: context?.toast_id
            })
        }
    })

    const sendInvoice = api.request.setInvoice.useMutation({
        onMutate: () => {
            const toast_id = toast.loading('Sending Invoice...')

            return { toast_id }
        },
        onError: (e, _, context) => {
            toast.error(e.message, {
                id: context?.toast_id
            })
        },
        onSuccess: (_, __, context) => {
            toast.success('Invoice sent', {
                id: context?.toast_id
            })

            void utils.request.getRequestById.invalidate()
        }
    })

    useRevalidateInvoiceItems(items, setItems)

    if (!currentInvoice) {
        return <div>No invoice found</div>
    }

    const columns: ColDef<InvoiceItem>[] = [
        {
            field: 'name',
            headerName: 'Name'
        },
        {
            field: 'quantity',
            headerName: 'Quantity'
        },
        {
            field: 'price',
            headerName: 'Price',
            valueFormatter: (params) => formatToCurrency(params.value / 100)
        }
    ]

    return (
        <Dialog>
            <AlertDialog>
                <Card>
                    <CardHeader className="flex w-full flex-row justify-between">
                        <div className="flex flex-col gap-2">
                            <CardTitle>Invoice</CardTitle>
                            <CardDescription>
                                Edit the invoice for this order
                            </CardDescription>
                            {!currentInvoice.isFinal && (
                                <CardDescription>
                                    Note: This invoice will be a downpayment of the full
                                    amount. User will{' '}
                                    <span className="font-bold">ONLY</span> pay the
                                    dowpyament percentage
                                </CardDescription>
                            )}
                        </div>
                        <div className="flex flex-row gap-2">
                            <Button
                                disabled={updateItems.isPending}
                                onClick={() => {
                                    updateItems.mutate({
                                        invoiceId: currentInvoice.id,
                                        items: items.map((item) => ({
                                            id: item.id ?? createId(),
                                            name: item.name,
                                            price: item.price,
                                            quantity: item.quantity
                                        }))
                                    })
                                }}
                            >
                                <Save className="h-4 w-4" />
                                Save
                            </Button>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button size={'icon'} variant={'ghost'}>
                                        <MoreVertical className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent>
                                    <DropdownMenuItem asChild>
                                        <DialogTrigger asChild>
                                            <Button
                                                className="w-full justify-start"
                                                variant={'ghost'}
                                                disabled={currentInvoice.sent}
                                            >
                                                <PencilIcon className="h-4 w-4" />
                                                Edit
                                            </Button>
                                        </DialogTrigger>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem asChild>
                                        <AlertDialogTrigger asChild>
                                            <Button
                                                className="w-full justify-start"
                                                variant={'ghost'}
                                                disabled={currentInvoice.sent}
                                            >
                                                <Send className="h-4 w-4" />
                                                Send
                                            </Button>
                                        </AlertDialogTrigger>
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <DataTable columnDefs={columns} rowData={items} />
                        <div className="flex w-full items-end justify-end">
                            <h2 className="text-lg font-bold">
                                Total:{' '}
                                {formatToCurrency(
                                    items.reduce(
                                        (acc, item) => acc + item.price * item.quantity,
                                        0
                                    ) / 100
                                )}
                            </h2>
                        </div>
                    </CardContent>
                </Card>
                <DialogContent className="overflow-y-auto">
                    <DialogHeader className="flex flex-row justify-between">
                        <div className="flex flex-col gap-2">
                            <DialogTitle>Edit Invoice</DialogTitle>
                            <DialogDescription>
                                Update/Add items to the invoice
                            </DialogDescription>
                        </div>
                        <Button
                            onClick={() =>
                                setItems([
                                    ...items,
                                    {
                                        id: createId(),
                                        name: 'New Item',
                                        quantity: 1,
                                        price: 0
                                    }
                                ])
                            }
                        >
                            <Plus className="h-4 w-4" />
                            Add Item
                        </Button>
                    </DialogHeader>
                    <InvoiceForm items={items} setItems={setItems} />
                </DialogContent>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will send the invoice to the client
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                sendInvoice.mutate({
                                    invoiceId: currentInvoice.id,
                                    isDownpaymentInvoice
                                })
                            }}
                        >
                            Confirm
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Dialog>
    )
}

const invoiceFormSchema = z.object({
    items: z.array(
        z.object({
            id: z.string().nullable(),
            name: z.string().min(1, { message: 'Name is required' }),
            quantity: z.number().min(1, { message: 'Quantity is required' }),
            price: z.number().min(1, { message: 'Price is required' })
        })
    )
})

type InvoiceFormSchema = z.infer<typeof invoiceFormSchema>

function InvoiceForm(props: {
    items: InvoiceItem[]
    setItems: (items: InvoiceItem[]) => void
}) {
    const form = useForm<InvoiceFormSchema>({
        resolver: zodResolver(invoiceFormSchema),
        mode: 'onBlur',
        defaultValues: {
            items: props.items
        }
    })

    const handleFieldUpdate = (
        index: number,
        field: keyof InvoiceItem,
        value: string
    ) => {
        const newItems = [...props.items]
        const numericValue =
            field === 'price' || field === 'quantity' ? parseInt(value) * 100 || 0 : value

        newItems[index] = {
            ...newItems[index],
            [field]: numericValue
        } as InvoiceItem

        props.setItems(newItems)
    }

    return (
        <Form {...form}>
            <form className="flex flex-col gap-4">
                {props.items.map((item, index) => (
                    <div key={item.id} className="grid grid-cols-3 items-center gap-4">
                        <FormItem>
                            <FormLabel>Name</FormLabel>
                            <FormControl>
                                <Input
                                    className="bg-secondary"
                                    placeholder="Name"
                                    defaultValue={item.name}
                                    onBlur={(e) =>
                                        handleFieldUpdate(index, 'name', e.target.value)
                                    }
                                    aria-label="Item name"
                                />
                            </FormControl>
                        </FormItem>
                        <FormItem>
                            <FormLabel>Quantity</FormLabel>
                            <FormControl>
                                <Input
                                    className="bg-secondary"
                                    type="number"
                                    placeholder="Quantity"
                                    defaultValue={item.quantity}
                                    onBlur={(e) =>
                                        handleFieldUpdate(
                                            index,
                                            'quantity',
                                            e.target.value
                                        )
                                    }
                                    aria-label="Item quantity"
                                />
                            </FormControl>
                        </FormItem>
                        <FormItem>
                            <FormLabel>Price</FormLabel>
                            <FormControl>
                                <Input
                                    className="bg-secondary"
                                    type="number"
                                    placeholder="Price"
                                    defaultValue={(item.price / 100).toFixed(2)}
                                    onBlur={(e) =>
                                        handleFieldUpdate(index, 'price', e.target.value)
                                    }
                                    aria-label="Item price"
                                />
                            </FormControl>
                        </FormItem>
                        <Button
                            variant={'destructive'}
                            size={'icon'}
                            onClick={() => {
                                const newItems = [...props.items]
                                newItems.splice(index, 1)
                                props.setItems(newItems)
                            }}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                ))}
            </form>
        </Form>
    )
}

function useRevalidateInvoiceItems(
    items: InvoiceItem[],
    setItems: (items: InvoiceItem[]) => void
) {
    useEffect(() => {
        setItems(items)
    }, [items, setItems])
}
