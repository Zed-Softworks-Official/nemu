'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { Form, FormControl, FormField, FormItem, FormLabel } from '~/components/ui/form'
import { Input } from '~/components/ui/input'
import { Textarea } from '~/components/ui/textarea'
import { Button } from '~/components/ui/button'
import { CheckCircle2Icon } from 'lucide-react'
import { api } from '~/trpc/react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

const commissionCreateFormSchema = z.object({
    name: z.string().min(2).max(50),
    description: z.string().max(256).optional()
})

type CommissionCreateFormSchemaType = z.infer<typeof commissionCreateFormSchema>

export default function FormCreateForm() {
    const [toastId, setToastId] = useState<string | number | undefined>(undefined)

    const router = useRouter()

    const mutation = api.form.set_form.useMutation({
        onMutate: () => {
            setToastId(toast.loading('Creating Form'))
        },
        onSuccess: () => {
            if (!toastId) return

            toast.success('Form Created!', {
                id: toastId
            })

            router.replace('/dashboard/forms')
        },
        onError: (e) => {
            if (!toastId) return

            toast.error(e.message, {
                id: toastId
            })
        }
    })

    const form = useForm<CommissionCreateFormSchemaType>({
        resolver: zodResolver(commissionCreateFormSchema),
        mode: 'onSubmit'
    })

    function ProcessForm(values: CommissionCreateFormSchemaType) {
        mutation.mutate(values)
    }

    return (
        <Form {...form}>
            <form
                className="mx-auto flex max-w-xl flex-col gap-5"
                onSubmit={form.handleSubmit(ProcessForm)}
            >
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem className="form-control">
                            <FormLabel className="label">Name:</FormLabel>
                            <Input placeholder="Your form name here" {...field} />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                        <FormItem className="form-control">
                            <FormControl className="label">Description:</FormControl>
                            <Textarea
                                placeholder="Something to describe the form (optional)"
                                className="resize-none"
                                rows={6}
                                {...field}
                            />
                        </FormItem>
                    )}
                />
                <div className="flex justify-end">
                    <Button type="submit" disabled={mutation.isPending}>
                        <CheckCircle2Icon className="h-6 w-6" />
                        Create Form
                    </Button>
                </div>
            </form>
        </Form>
    )
}
