'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Check } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '~/components/ui/button'

import { Form, FormLabel, FormField, FormItem } from '~/components/ui/form'
import { Input } from '~/components/ui/input'
import { Separator } from '~/components/ui/separator'
import { Textarea } from '~/components/ui/textarea'
import { api } from '~/trpc/react'

const formSchema = z.object({
    name: z.string().min(1, { message: 'Name is required' }),
    description: z.string().min(1, { message: 'Description is required' })
})

type FormSchemaType = z.infer<typeof formSchema>

export function CreateForm() {
    const form = useForm<FormSchemaType>({
        resolver: zodResolver(formSchema),
        mode: 'onSubmit'
    })

    const createForm = api.request.setForm.useMutation()

    const processForm = async (values: FormSchemaType) => {
        const toastId = toast.loading('Creating Form')

        await createForm.mutateAsync(
            {
                name: values.name,
                description: values.description
            },
            {
                onSuccess: () => {
                    toast.success('Form Created!', {
                        id: toastId
                    })
                },
                onError: () => {
                    toast.error('Failed to create form', {
                        id: toastId
                    })
                }
            }
        )
    }

    return (
        <Form {...form}>
            <form
                className="container mx-auto flex max-w-xl flex-col gap-5"
                onSubmit={form.handleSubmit(processForm)}
            >
                <h1 className="text-2xl font-bold">Create Form</h1>
                <Separator />
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Name:</FormLabel>
                            <Input
                                {...form.register('name')}
                                placeholder="Your form name here"
                                className="bg-background-secondary"
                                defaultValue={field.value ?? ''}
                            />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Description:</FormLabel>
                            <Textarea
                                {...form.register('description')}
                                placeholder="Something to describe the form (optional)"
                                className="bg-background-secondary resize-none"
                                rows={6}
                                defaultValue={field.value ?? ''}
                            />
                        </FormItem>
                    )}
                />
                <div className="flex justify-end">
                    <Button type="submit" disabled={createForm.isPending}>
                        <Check className="h-6 w-6" />
                        Create form
                    </Button>
                </div>
            </form>
        </Form>
    )
}
