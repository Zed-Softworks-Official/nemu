'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import { toast } from 'sonner'

import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { Form, FormField, FormItem, FormLabel } from '~/components/ui/form'
import { Input } from '~/components/ui/input'
import { Textarea } from '~/components/ui/textarea'
import { Button } from '~/components/ui/button'

import { set_form } from '~/server/actions/form'

const formSchema = z.object({
    name: z.string().min(2).max(50),
    description: z.string().max(256).optional()
})

type FormSchemaType = z.infer<typeof formSchema>

export function CreateFormsForm() {
    const [pending, setPending] = useState(false)
    const router = useRouter()

    const form = useForm<FormSchemaType>({
        resolver: zodResolver(formSchema),
        mode: 'onSubmit'
    })

    const process_form = async (values: FormSchemaType) => {
        setPending(true)
        const toast_id = toast.loading('Creating form')

        const res = await set_form(values.name, values.description)

        if (!res.success) {
            toast.error('Failed to create form', { id: toast_id })

            setPending(false)
            return
        }

        toast.success('Form created!', {
            id: toast_id
        })

        router.push('/dashboard/forms')
    }

    return (
        <Form {...form}>
            <form
                className="mx-auto flex flex-col gap-5"
                onSubmit={form.handleSubmit(process_form)}
            >
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem className="form-control">
                            <FormLabel className="label">Name:</FormLabel>
                            <Input
                                {...form.register('name')}
                                placeholder="Your form name here"
                                className="bg-base-200"
                                defaultValue={field.value ?? ''}
                            />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                        <FormItem className="form-control">
                            <FormLabel className="label">Description:</FormLabel>
                            <Textarea
                                {...form.register('description')}
                                placeholder="Something to describe the form (optional)"
                                className="resize-none bg-base-200"
                                rows={6}
                                defaultValue={field.value ?? ''}
                            />
                        </FormItem>
                    )}
                />
                <div className="flex justify-end">
                    <Button type="submit" disabled={pending}>
                        <Check className="h-6 w-6" />
                        Create form
                    </Button>
                </div>
            </form>
        </Form>
    )
}
