'use client'

import TextArea from '@/components/form/text-area'
import TextInput from '@/components/form/text-input'
import { useDashboardContext } from '@/components/navigation/dashboard/dashboard-context'
import { api } from '@/core/api/react'

import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircleIcon } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { toast } from 'react-toastify'

import * as z from 'zod'

const commissionCreateFormSchema = z.object({
    form_name: z.string().min(2).max(50),
    form_desc: z.string().max(500).optional()
})

type CommissionCreateFormSchemaType = z.infer<typeof commissionCreateFormSchema>

export default function CommissionCreateForm({ refetch }: { refetch: any }) {
    const { artist } = useDashboardContext()!
    const mutation = api.form.set_form.useMutation({
        onSuccess: () => {
            refetch()
        }
    })
    const form = useForm<CommissionCreateFormSchemaType>({
        resolver: zodResolver(commissionCreateFormSchema),
        mode: 'onSubmit'
    })

    async function CreateCommissionForm(values: CommissionCreateFormSchemaType) {
        const toast_id = toast.loading('Creating form', { theme: 'dark' })

        mutation
            .mutateAsync({
                artist_id: artist?.id!,
                form_name: values.form_name,
                form_desc: values.form_desc
            })
            .then((res) => {
                if (!res.success) {
                    toast.update(toast_id, {
                        render: 'Form could not be created',
                        type: 'error',
                        autoClose: 5000,
                        isLoading: false
                    })
                }

                toast.update(toast_id, {
                    render: 'Form Created',
                    type: 'success',
                    autoClose: 5000,
                    isLoading: false
                })
            })
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
