'use client'

import * as z from 'zod'

import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowDownOnSquareStackIcon, CurrencyDollarIcon, HashtagIcon, PlusCircleIcon, XCircleIcon } from '@heroicons/react/20/solid'
import { FormatNumberToCurrency } from '@/core/helpers'
import { UpdateInvoiceData } from '@/core/structures'
import { NemuResponse, StatusCode } from '@/core/responses'
import { toast } from 'react-toastify'
import { CreateToastPromise } from '@/core/promise'

const invoiceSchema = z.object({
    items: z
        .array(
            z.object({
                description: z.string().min(2).max(256),
                quantity: z.number().min(1),
                price: z.number().min(1)
            })
        )
        .default([])
})

type InvoiceSchemaType = z.infer<typeof invoiceSchema>

export default function CreateInvoiceForm({
    submission_id,
    customer_id,
    stripe_account
}: {
    submission_id: string
    customer_id: string
    stripe_account: string
}) {
    const form = useForm<InvoiceSchemaType>({
        resolver: zodResolver(invoiceSchema),
        mode: 'onSubmit'
    })

    async function ApplyChanges(values: InvoiceSchemaType) {
        const data: UpdateInvoiceData = {
            items: values.items,
            submission_id: submission_id,
            stripe_account: stripe_account,
            customer_id: customer_id
        }

        await CreateToastPromise(fetch(`/api/invoice`, { method: 'post', body: JSON.stringify(data) }), {
            pending: 'Updating Invoice',
            success: 'Invoice Updated'
        })
    }

    function CalculateTotalPrice() {
        let result = 0
        for (let item of form.getValues('items')) {
            result += item.price * item.quantity
        }

        return FormatNumberToCurrency(result)
    }

    return (
        <div className="flex flex-col">
            <h2 className="card-title">Edit Invoice Items</h2>
            <div className="divider"></div>
            <div className="card bg-base-300 max-w-xl shadow-xl mx-auto w-full">
                <div className="card-body">
                    <form className="flex flex-col gap-5" onSubmit={form.handleSubmit(ApplyChanges)}>
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
                                                            description: '',
                                                            price: 0,
                                                            quantity: 0
                                                        }
                                                    ])
                                                } else {
                                                    form.setValue(
                                                        'items',
                                                        form.getValues('items').concat({
                                                            description: '',
                                                            price: 0,
                                                            quantity: 0
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
                                            <div key={index} className="flex flex-col rounded-xl p-5 bg-base-300 gap-5">
                                                <div>
                                                    <div className="flex justify-between items-center">
                                                        <h2 className="card-title">Item {index + 1}</h2>
                                                        <button
                                                            type="button"
                                                            className="btn btn-error"
                                                            onClick={(e) => {
                                                                e.preventDefault()

                                                                const newItems = [...field.value]
                                                                newItems.splice(index, 1)
                                                                field.onChange(newItems)
                                                            }}
                                                        >
                                                            <XCircleIcon className="w-6 h-6" />
                                                        </button>
                                                    </div>
                                                    <div className="divider"></div>
                                                </div>
                                                <div className="form-control">
                                                    <label className="label">Description:</label>
                                                    <textarea
                                                        className="textarea resize-none w-full"
                                                        rows={4}
                                                        placeholder="Enter Description"
                                                        value={item.description}
                                                        onChange={(e) => {
                                                            field.value[index] = {
                                                                description: e.currentTarget.value,
                                                                price: field.value[index].price,
                                                                quantity: field.value[index].quantity
                                                            }
                                                            field.onChange(field.value)
                                                        }}
                                                    />
                                                </div>
                                                <div className="form-control">
                                                    <label className="label">Item Price:</label>
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
                                                                field.value[index] = {
                                                                    description: field.value[index].description,
                                                                    price: Number(e.currentTarget.value),
                                                                    quantity: field.value[index].quantity
                                                                }
                                                                field.onChange(field.value)
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                                <div className="form-control">
                                                    <label className="label">Item Quantity:</label>
                                                    <div className="join">
                                                        <div className="join-item flex jutify-center items-center px-5 bg-base-200">
                                                            <HashtagIcon className="w-6 h-6" />
                                                        </div>
                                                        <input
                                                            className="input w-full join-item"
                                                            inputMode="numeric"
                                                            placeholder="Item Quanityt"
                                                            value={item.quantity}
                                                            onChange={(e) => {
                                                                field.value[index] = {
                                                                    description: field.value[index].description,
                                                                    price: field.value[index].price,
                                                                    quantity: Number(e.currentTarget.value)
                                                                }
                                                                field.onChange(field.value)
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            )}
                        />

                        <div className="flex flex-col gap-5 bg-base-100 p-5 rounded-xl">
                            <p>Total Items: {form.watch('items') ? form.watch('items').length : 0}</p>
                            <p>Total Cost: {form.watch('items') ? CalculateTotalPrice() : '$0.00'}</p>
                        </div>
                        <button type="submit" className="btn btn-primary w-full">
                            <ArrowDownOnSquareStackIcon className="w-6 h-6" />
                            Save Invoice
                        </button>
                    </form>
                </div>
            </div>
        </div>
    )
}
