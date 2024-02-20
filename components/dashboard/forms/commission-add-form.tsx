'use client'

import * as z from 'zod'
import useSWR from 'swr'
import Link from 'next/link'

import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useFormContext } from '@/components/form/form-context'
import TextField from '@/components/form/text-input'

import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/20/solid'
import SelectField, { SelectFieldOptions } from '@/components/form/select-input'
import { GraphQLFetcher } from '@/core/helpers'
import Loading from '@/components/loading'
import CheckboxField from '@/components/form/checkbox-input'
import FileField from '@/components/form/file-input'
import MarkdownEditor from '@/components/form/markdown-text-area'
import { useDashboardContext } from '@/components/navigation/dashboard/dashboard-context'
import FormDropzone from '@/components/form/form-dropzone'
import CurrencyField from '@/components/form/currency-field'
import { CommissionAvailability } from '@/core/structures'
import { toast } from 'react-toastify'
import { NemuResponse, StatusCode } from '@/core/responses'

const commissionSchema = z.object({
    title: z.string().min(2).max(50),
    description: z.string().min(10).max(500),
    form: z.string().min(1),

    use_invoicing: z.boolean().default(true),
    price: z.number().min(0).default(0).optional(),

    featured_image: z.any(z.instanceof(File).refine((file: File) => file.size != 0)),
    additional_images: z.any().optional(),

    rush: z.boolean().default(false),
    rush_charge: z.number().default(0).optional(),

    max_commissions_until_waitlist: z.number().default(0).optional(),
    max_commissions_until_closed: z.number().default(0).optional(),

    commission_availability: z.number()
})

type CommissionSchemaType = z.infer<typeof commissionSchema>

export default function CommissionAddForm() {
    const { artistId } = useDashboardContext()
    const { image } = useFormContext()
    const form = useForm<CommissionSchemaType>({
        resolver: zodResolver(commissionSchema),
        mode: 'onSubmit',
        defaultValues: {
            use_invoicing: true,
            price: 0,
            rush_charge: 0,
            max_commissions_until_waitlist: 0,
            max_commissions_until_closed: 0
        }
    })

    const { data, isLoading } = useSWR(
        `{
            artist(id: "${artistId}") {
                forms {
                    id
                    name
                }
            }
        }`,
        GraphQLFetcher<{ artist: { forms: { id: string; name: string }[] } }>
    )

    const [submitting, setSubmitting] = useState(false)

    function convertArrayToGraphQLArray(string_array: string[]) {
        const array = string_array.slice(1, string_array.length)
        let result = `[`

        for (let i = 0; i < array.length; i++) {
            if (i != array.length - 1) {
                result += `"${array[i]}", `
            } else {
                result += `"${array[i]}"]`
            }
        }

        return result
    }

    async function CreateCommission(values: CommissionSchemaType) {
        setSubmitting(true)
        const toast_id = toast.loading('Creating commission', { theme: 'dark' })

        // Get the amount of images to upload
        const number_of_images = 1 + values.additional_images.length

        // Create image keys
        const image_keys: string[] = []
        for (let i = 0; i < number_of_images; i++) {
            image_keys.push(crypto.randomUUID())
        }

        // Create formdata for the aws files
        const awsData = new FormData()
        awsData.append('file_keys', JSON.stringify(image_keys))
        awsData.append('featured_image', image!)

        for (let i = 0; i < values.additional_images.length; i++) {
            awsData.append(`file-${i}`, values.additional_images[i])
        }

        // Make Request to AWS Rest API to handle multiple files
        await fetch(`/api/aws/${artistId}/commission/multiple`, {
            method: 'post',
            body: awsData
        })

        // Make Request to GraphQL to create new commission object
        const graphql_response = await GraphQLFetcher<{
            create_commission: NemuResponse
        }>(`
        mutation {
            create_commission(
                artist_id: "${artistId}"
                title: "${values.title}"
                description: "${values.description}"
                additional_images: ${convertArrayToGraphQLArray(image_keys)}
                featured_image: "${image_keys[0]}"
                price: ${values.price}
                availability: ${values.commission_availability}
                form_id: "${values.form}"
                use_invoicing: ${values.use_invoicing}
                rush_orders_allowed: ${values.rush}
                max_commission_until_waitlist: ${values.max_commissions_until_waitlist}
                max_commission_until_closed: ${values.max_commissions_until_closed}
            ) {
                status
                message
            }
        }`)

        if (graphql_response?.create_commission?.status != StatusCode.Success) {
            toast.update(toast_id, {
                render: graphql_response.create_commission.message,
                type: 'error',
                autoClose: 5000,
                isLoading: false
            })
        } else {
            toast.update(toast_id, {
                render: 'Commission Created',
                type: 'success',
                autoClose: 5000,
                isLoading: false
            })
        }
    }

    if (isLoading) {
        return <Loading />
    }

    function getFormsNames() {
        const result: SelectFieldOptions[] = []
        data?.artist.forms.forEach((form) => {
            result.push({
                key: form.name,
                value: form.id
            })
        })

        return result
    }

    return (
        <div className="max-w-xl mx-auto">
            <form
                onSubmit={form.handleSubmit(CreateCommission)}
                className="flex flex-col gap-5"
            >
                <TextField
                    label="Title"
                    placeholder="Title"
                    {...form.register('title')}
                />
                <Controller
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                        <MarkdownEditor
                            label="Description"
                            markdown={''}
                            placeholder="Enter a description of the commission"
                            input_name={field.name}
                            change_event={field.onChange}
                        />
                    )}
                />
                <div className="card bg-base-100 shadow-xl">
                    <div className="card-body">
                        <div
                            className="tooltip"
                            data-tip="If checked, you will be able to send out invoices and change the price of the commission based on the clients requests"
                        >
                            <CheckboxField
                                label="Use Invoicing"
                                {...form.register('use_invoicing')}
                            />
                        </div>

                        {!form.watch('use_invoicing') && (
                            <CurrencyField
                                min={0}
                                label="Price"
                                placeholder="Price"
                                additionalClassnames="bg-base-300"
                                {...form.register('price', { valueAsNumber: true })}
                            />
                        )}
                    </div>
                </div>
                <div className="divider"></div>

                <SelectField
                    label="Form"
                    options={getFormsNames()}
                    placeholder="Select a form to use"
                    join
                    {...form.register('form')}
                />
                <SelectField
                    label="Commission Availabilty"
                    options={[
                        {
                            key: 'Open',
                            value: CommissionAvailability.Open
                        },
                        {
                            key: 'Waitlist',
                            value: CommissionAvailability.Waitlist
                        },
                        {
                            key: 'Closed',
                            value: CommissionAvailability.Closed
                        }
                    ]}
                    placeholder="Select an availability"
                    {...form.register('commission_availability', { valueAsNumber: true })}
                />
                <TextField
                    label="Commission Until Waitlist"
                    placeholder="0"
                    inputMode="numeric"
                    {...form.register('max_commissions_until_waitlist', {
                        valueAsNumber: true
                    })}
                />
                <TextField
                    label="Commission Until Closed"
                    placeholder="0"
                    inputMode="numeric"
                    {...form.register('max_commissions_until_closed', {
                        valueAsNumber: true
                    })}
                />
                <div className="divider"></div>

                <FormDropzone
                    label="Featured Image"
                    {...form.register('featured_image')}
                />
                <FileField
                    label="Additional Images"
                    multiple
                    {...form.register('additional_images')}
                />

                <div className="divider"></div>
                <div className="card bg-base-100 shadow-xl">
                    <div className="card-body">
                        <CheckboxField
                            label="Allow Rush Orders"
                            {...form.register('rush')}
                        />
                        {form.watch('rush') && (
                            <CurrencyField
                                label="Rush Charge"
                                additionalClassnames="bg-base-300"
                                placeholder="Rush Charge"
                                {...form.register('rush_charge', { valueAsNumber: true })}
                            />
                        )}
                    </div>
                </div>

                <div className="divider"></div>
                <p className="text-base-content/80">
                    <i>
                        Note: Commissions will need to be published. Make sure you have
                        created the commission form for users to fill out upon a request.
                    </i>
                </p>
                <div className="grid grid-cols-2 gap-5">
                    <Link href={'/dashboard/commissions'} className="btn btn-error">
                        <XCircleIcon className="w-6 h-6" />
                        Cancel
                    </Link>
                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={submitting}
                    >
                        {submitting ? (
                            <>
                                <span className="loading loading-spinner"></span>
                                Creating Commission
                            </>
                        ) : (
                            <>
                                <CheckCircleIcon className="w-6 h-6" />
                                Create Commission
                            </>
                        )}
                    </button>
                </div>
            </form>
        </div>
    )
}
