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
import SelectField from '@/components/form/select-input'
import { GraphQLFetcher } from '@/core/helpers'
import Loading from '@/components/loading'
import CheckboxField from '@/components/form/checkbox-input'
import FileField from '@/components/form/file-input'
import MarkdownEditor from '@/components/form/markdown-text-area'
import { useDashboardContext } from '@/components/navigation/dashboard/dashboard-context'
import FormDropzone from '@/components/form/form-dropzone'
import CurrencyField from '@/components/form/currency-field'
import { Transition } from '@headlessui/react'

const commissionSchema = z.object({
    title: z.string().min(2).max(50),
    description: z.string().min(10).max(500),
    price: z.number().min(0),
    form: z.string().min(1),

    featured_image: z.any(z.instanceof(File).refine((file: File) => file.size != 0)),
    additional_files: z.any().optional(),

    rush: z.boolean().default(false),
    rush_charge: z.number().optional()
})

type CommissionSchemaType = z.infer<typeof commissionSchema>

export default function CommissionAddForm() {
    const { artistId } = useDashboardContext()
    const { image } = useFormContext()
    const form = useForm<CommissionSchemaType>({
        resolver: zodResolver(commissionSchema),
        mode: 'onSubmit',
        defaultValues: {
            rush_charge: 0
        }
    })

    const { data, isLoading } = useSWR(
        `{
            artist(id: "${artistId}") {
                forms {
                    name
                }
            }
        }`,
        GraphQLFetcher<{ artist: { forms: { name: string }[] } }>
    )

    const [submitting, setSubmitting] = useState(false)

    async function CreateCommission(values: CommissionSchemaType) {
        //setSubmitting(true)

        

        console.log(values)
    }

    if (isLoading) {
        return <Loading />
    }

    function getFormsNames() {
        const result: string[] = []
        data?.artist.forms.forEach((form) => {
            result.push(form.name)
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
                <CurrencyField
                    min={0}
                    label="Price"
                    placeholder="Price"
                    {...form.register('price', { valueAsNumber: true })}
                />
                <SelectField
                    label="Form"
                    options={getFormsNames()}
                    placeholder="Select a form to use"
                    join
                    {...form.register('form')}
                />
                <FormDropzone
                    label="Featured Image"
                    {...form.register('featured_image')}
                />
                <FileField
                    label="Additional Files"
                    {...form.register('additional_files')}
                />

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
                                {...form.register('rush_charge', {valueAsNumber: true})}
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
