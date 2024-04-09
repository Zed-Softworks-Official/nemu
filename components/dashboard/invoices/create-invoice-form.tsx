'use client'

import * as z from 'zod'

import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
    ArrowDownOnSquareStackIcon,
    CurrencyDollarIcon,
    HashtagIcon,
    PlusCircleIcon,
    XCircleIcon
} from '@heroicons/react/20/solid'
import { FormatNumberToCurrency } from '@/core/helpers'
import { InvoiceItem } from '@prisma/client'
import { toast } from 'react-toastify'
import { api } from '@/core/trpc/react'

const invoiceSchema = z.object({
    items: z
        .array(
            z.object({
                id: z.string().optional(),
                name: z.string().min(2).max(256),
                quantity: z.number().min(1),
                price: z.number().min(1),
                delete: z.boolean().default(false)
            })
        )
        .default([])
})

type InvoiceSchemaType = z.infer<typeof invoiceSchema>

export default function CreateInvoiceForm({
    invoice_id,
    invoice_items
}: {
    invoice_id: string
    invoice_items?: InvoiceItem[]
}) {
    const form = useForm<InvoiceSchemaType>({
        resolver: zodResolver(invoiceSchema),
        mode: 'onSubmit',
        defaultValues: {
            items: invoice_items ? invoice_items : []
        }
    })

    const mutation = api.invoices.update_invoice.useMutation()

    async function ApplyChanges(values: InvoiceSchemaType) {
        const toast_id = toast.loading('Updating invoice', { theme: 'dark' })

        mutation
            .mutateAsync({
                invoice_id,
                invoice_items: values.items
            })
            .then((res) => {
                if (!res.success) {
                    toast.update(toast_id, {
                        isLoading: false,
                        autoClose: 5000,
                        render: 'Could not update invoice',
                        type: 'error'
                    })

                    return
                }

                toast.update(toast_id, {
                    isLoading: false,
                    autoClose: 5000,
                    render: 'Updated Invoice',
                    type: 'success'
                })
            })
    }

    function CalculateTotalPrice() {
        let result = 0
        for (let item of form.getValues('items')) {
            if (item.delete) {
                continue
            }

            result += item.price * item.quantity
        }

        return FormatNumberToCurrency(result)
    }

    return (
        <div className="flex flex-col">
            <div className="card bg-base-300 max-w-xl shadow-xl mx-auto w-full">
                <div className="card-body">
                    <form
                        className="flex flex-col gap-5"
                        onSubmit={form.handleSubmit(ApplyChanges)}
                    >
                        <Controller
                            name="items"
                            control={form.control}
                            render={({ field }) => (
                                <div className="flex flex-col p-5 bg-base-100 rounded-xl gap-5">
                                    <div className="flex justify-between items-center">
                                        <h2 className="card-title">Items</h2>
                                        <button
                                            type="button"
                                            className="btn"
                                            onClick={(e) => {
                                                e.preventDefault()

                                                if (!form.getValues('items')) {
                                                    form.setValue('items', [
                                                        {
                                                            name: '',
                                                            price: 0,
                                                            quantity: 0,
                                                            delete: false
                                                        }
                                                    ])
                                                } else {
                                                    form.setValue(
                                                        'items',
                                                        form.getValues('items').concat({
                                                            name: '',
                                                            price: 0,
                                                            quantity: 0,
                                                            delete: false
                                                        })
                                                    )
                                                }
                                            }}
                                        >
                                            <PlusCircleIcon className="w-6 h-6" />
                                            Add Item
                                        </button>
                                    </div>
                                    <div className="divider"></div>
                                    {form.getValues('items') &&
                                        form.watch('items').map((item, index) => (
                                            <>
                                                {!item.delete && (
                                                    <div
                                                        key={index}
                                                        className="flex flex-col rounded-xl p-5 bg-base-300 gap-5"
                                                    >
                                                        <div>
                                                            <div className="flex justify-between items-center">
                                                                <h2 className="card-title">
                                                                    Item {index + 1}
                                                                </h2>
                                                                <button
                                                                    type="button"
                                                                    className="btn btn-error"
                                                                    onClick={(e) => {
                                                                        e.preventDefault()

                                                                        field.value[
                                                                            index
                                                                        ] = {
                                                                            id: field
                                                                                .value[
                                                                                index
                                                                            ].id,
                                                                            name: field
                                                                                .value[
                                                                                index
                                                                            ].name,
                                                                            price: field
                                                                                .value[
                                                                                index
                                                                            ].price,
                                                                            quantity:
                                                                                field
                                                                                    .value[
                                                                                    index
                                                                                ]
                                                                                    .quantity,
                                                                            delete: true
                                                                        }
                                                                        field.onChange(
                                                                            field.value
                                                                        )
                                                                    }}
                                                                >
                                                                    <XCircleIcon className="w-6 h-6" />
                                                                </button>
                                                            </div>
                                                            <div className="divider"></div>
                                                        </div>
                                                        <div className="form-control">
                                                            <label className="label">
                                                                Description:
                                                            </label>
                                                            <textarea
                                                                className="textarea resize-none w-full"
                                                                rows={4}
                                                                placeholder="Enter Description"
                                                                value={item.name}
                                                                onChange={(e) => {
                                                                    field.value[index] = {
                                                                        id: field.value[
                                                                            index
                                                                        ].id,
                                                                        name: e
                                                                            .currentTarget
                                                                            .value,
                                                                        price: field
                                                                            .value[index]
                                                                            .price,
                                                                        quantity:
                                                                            field.value[
                                                                                index
                                                                            ].quantity,
                                                                        delete: field
                                                                            .value[index]
                                                                            .delete
                                                                    }
                                                                    field.onChange(
                                                                        field.value
                                                                    )
                                                                }}
                                                            />
                                                        </div>
                                                        <div className="form-control">
                                                            <label className="label">
                                                                Item Price:
                                                            </label>
                                                            <div className="join">
                                                                <div className="join-item flex jutify-center items-center px-5 bg-base-200">
                                                                    <CurrencyDollarIcon className="w-6 h-6" />
                                                                </div>
                                                                <input
                                                                    className="input w-full"
                                                                    inputMode="numeric"
                                                                    placeholder="Item Price"
                                                                    value={item.price}
                                                                    onChange={(e) => {
                                                                        field.value[
                                                                            index
                                                                        ] = {
                                                                            id: field
                                                                                .value[
                                                                                index
                                                                            ].id,
                                                                            name: field
                                                                                .value[
                                                                                index
                                                                            ].name,
                                                                            price: Number(
                                                                                e
                                                                                    .currentTarget
                                                                                    .value
                                                                            ),
                                                                            quantity:
                                                                                field
                                                                                    .value[
                                                                                    index
                                                                                ]
                                                                                    .quantity,
                                                                            delete: field
                                                                                .value[
                                                                                index
                                                                            ].delete
                                                                        }
                                                                        field.onChange(
                                                                            field.value
                                                                        )
                                                                    }}
                                                                />
                                                            </div>
                                                        </div>
                                                        <div className="form-control">
                                                            <label className="label">
                                                                Item Quantity:
                                                            </label>
                                                            <div className="join">
                                                                <div className="join-item flex jutify-center items-center px-5 bg-base-200">
                                                                    <HashtagIcon className="w-6 h-6" />
                                                                </div>
                                                                <input
                                                                    className="input w-full join-item"
                                                                    inputMode="numeric"
                                                                    placeholder="Item Quantity"
                                                                    value={item.quantity}
                                                                    onChange={(e) => {
                                                                        field.value[
                                                                            index
                                                                        ] = {
                                                                            id: field
                                                                                .value[
                                                                                index
                                                                            ].id,
                                                                            name: field
                                                                                .value[
                                                                                index
                                                                            ].name,
                                                                            price: field
                                                                                .value[
                                                                                index
                                                                            ].price,
                                                                            quantity:
                                                                                Number(
                                                                                    e
                                                                                        .currentTarget
                                                                                        .value
                                                                                ),
                                                                            delete: field
                                                                                .value[
                                                                                index
                                                                            ].delete
                                                                        }
                                                                        field.onChange(
                                                                            field.value
                                                                        )
                                                                    }}
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        ))}
                                </div>
                            )}
                        />

                        <div className="flex flex-col gap-5 bg-base-100 p-5 rounded-xl">
                            <p>
                                Total Items:{' '}
                                {form.watch('items') ? form.watch('items').length : 0}
                            </p>
                            <p>
                                Total Cost:{' '}
                                {form.watch('items') ? CalculateTotalPrice() : '$0.00'}
                            </p>
                        </div>
                        <button type="submit" className="btn btn-outline btn-accent w-full">
                            <ArrowDownOnSquareStackIcon className="w-6 h-6" />
                            Save Invoice
                        </button>
                    </form>
                </div>
            </div>
        </div>
    )
}
