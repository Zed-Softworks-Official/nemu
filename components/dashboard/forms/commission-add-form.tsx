'use client'

import * as z from 'zod'

import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'

import TextField from '@/components/form/text-input'

import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircleIcon, PlusCircleIcon, XCircleIcon } from '@heroicons/react/20/solid'
import SelectField from '@/components/form/select-input'
import useSWR from 'swr'
import { useSession } from 'next-auth/react'
import { Fetcher } from '@/core/helpers'
import { CommissionFormsResponse } from '@/core/responses'
import Loading from '@/components/loading'
import CheckboxField from '@/components/form/checkbox-input'
import FileField from '@/components/form/file-input'
import MarkdownEditor from '@/components/form/markdown-text-area'

const commissionSchema = z.object({
    title: z.string().min(2).max(50).optional(),
    description: z.string().min(10).max(500).optional(),
    price: z.number().min(0).optional().optional(),
    form: z.string().min(1).optional(),
    rush: z.boolean().default(false).optional()
})

type CommissionSchemaType = z.infer<typeof commissionSchema>

export default function CommissionAddForm() {
    const { data: session } = useSession()
    const form = useForm<CommissionSchemaType>({
        resolver: zodResolver(commissionSchema),
        mode: 'onSubmit'
    })

    const { data: artistForms, isLoading } = useSWR<CommissionFormsResponse>(
        `/api/artist/${session?.user.user_id}/forms`,
        Fetcher
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
        artistForms?.forms?.forEach((form) => {
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
                <TextField
                    type="number"
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
                <TextField label="Featured Image" placeholder="Featured Image" />
                <FileField label="Additional Files" />

                <div className="card bg-base-100 shadow-xl">
                    <div className="card-body">
                        <CheckboxField
                            label="Allow Rush Orders"
                            {...form.register('rush')}
                        />
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
                    <button type="submit" className="btn btn-error">
                        <XCircleIcon className="w-6 h-6" />
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={submitting}
                    >
                        <CheckCircleIcon className="w-6 h-6" />
                        Create Commission
                    </button>
                </div>
            </form>
        </div>
    )
}
