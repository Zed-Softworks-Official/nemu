'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Check } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '~/app/_components/ui/button'

import { Form, FormLabel, FormField, FormItem } from '~/app/_components/ui/form'
import { Input } from '~/app/_components/ui/input'
import { Separator } from '~/app/_components/ui/separator'
import { Textarea } from '~/app/_components/ui/textarea'
import { api } from '~/trpc/react'

const formSchema = z.object({
    name: z.string().min(1, { message: 'Name is required' }),
    description: z.string().optional()
})

type FormSchemaType = z.infer<typeof formSchema>

export function CreateForm() {
    const router = useRouter()
    const form = useForm<FormSchemaType>({
        resolver: zodResolver(formSchema),
        mode: 'onSubmit',
        defaultValues: {
            name: '',
            description: ''
        }
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
                onSuccess: (res) => {
                    toast.success('Form Created!', {
                        id: toastId
                    })

                    router.push(`/dashboard/forms/${res.id}`)
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
                                placeholder="Your form name here"
                                className="bg-background-secondary"
                                {...field}
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
                                placeholder="Something to describe the form (optional)"
                                className="bg-background-secondary resize-none"
                                rows={6}
                                {...field}
                            />
                        </FormItem>
                    )}
                />
                <div className="flex justify-end">
                    <Button
                        type="submit"
                        disabled={createForm.isPending || createForm.isSuccess}
                    >
                        <Check className="h-6 w-6" />
                        Create form
                    </Button>
                </div>
            </form>
        </Form>
    )
}
