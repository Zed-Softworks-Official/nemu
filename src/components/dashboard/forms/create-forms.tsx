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
import { useTheme } from 'next-themes'
import { nemu_toast } from '~/lib/utils'

const commissionCreateFormSchema = z.object({
    name: z.string().min(2).max(50),
    description: z.string().max(256).optional()
})

type CommissionCreateFormSchemaType = z.infer<typeof commissionCreateFormSchema>

export default function FormCreateForm() {
    const { resolvedTheme } = useTheme()

    const mutation = api.form.set_form.useMutation({
        onSuccess: () => {
            nemu_toast('Form Created!', { theme: resolvedTheme, type: 'success' })
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
                className="flex flex-col gap-5 max-w-xl mx-auto"
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
                    <Button type="submit">
                        <CheckCircle2Icon className="w-6 h-6" />
                        Create Form
                    </Button>
                </div>
            </form>
        </Form>
    )
}
