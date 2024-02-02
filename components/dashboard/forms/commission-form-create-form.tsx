'use client'

import TextArea from '@/components/form/text-area'
import TextInput from '@/components/form/text-input'
import { useDashboardContext } from '@/components/navigation/dashboard/dashboard-context'
import { GraphQLFetcher } from '@/core/helpers'

import { CheckCircleIcon } from '@heroicons/react/20/solid'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { toast } from 'react-toastify'

import * as z from 'zod'

const commissionCreateFormSchema = z.object({
    form_name: z.string().min(2).max(50),
    form_desc: z.string().max(500).optional()
})

type CommissionCreateFormSchemaType = z.infer<typeof commissionCreateFormSchema>

export default function CommissionCreateForm() {
    const { artistId } = useDashboardContext()
    const form = useForm<CommissionCreateFormSchemaType>({
        resolver: zodResolver(commissionCreateFormSchema),
        mode: 'onSubmit'
    })

    async function CreateCommissionForm(values: CommissionCreateFormSchemaType) {
        await GraphQLFetcher(`mutation {
            create_new_form(artist_id: "${artistId}", form_name: "${values.form_name}", form_desc: "${values.form_desc}") {
                status
            }
        }`)

        toast('Form Created Successfully', { type: 'success', theme: 'dark' })

        // TODO: Move to new form
    }

    return (
        <div className="max-w-xl mx-auto">
            <h1 className="card-title">Create a new form</h1>
            <div className="divider"></div>
            <form
                onSubmit={form.handleSubmit(CreateCommissionForm)}
                className="flex flex-col gap-5"
            >
                <TextInput
                    label="Form Name"
                    placeholder="Enter your unique form name"
                    {...form.register('form_name')}
                />
                <TextArea
                    label="Form Description"
                    rows={5}
                    placeholder="Something to help you remember what this is for"
                    {...form.register('form_desc')}
                />
                <button type="submit" className="btn btn-primary">
                    <CheckCircleIcon className="w-6 h-6" />
                    Create Form
                </button>
            </form>
        </div>
    )
}
