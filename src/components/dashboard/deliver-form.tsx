'use client'

import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '~/components/ui/button'
import { api } from '~/trpc/react'
import { Form, FormControl, FormField, FormItem } from '~/components/ui/form'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Label } from '~/components/ui/label'
import { Input } from '~/components/ui/input'

interface DeliverFormProps {
    request_id: string
    user_id: string
    delivered: boolean
}

const deliverFormSchema = z.object({
    url: z.string().url('Needs to be a valid url!')
})

type DeliverFormSchemaType = z.infer<typeof deliverFormSchema>

export default function DeliverForm(props: DeliverFormProps) {
    const [toastId, setToastId] = useState<string | number | undefined>(undefined)

    const mutation = api.downloads.set_download.useMutation({
        onMutate: () => {
            setToastId(toast.loading('Creating download'))
        },
        onSuccess: () => {
            if (!toastId) return

            toast.success('Delivered!', {
                id: toastId
            })
        },
        onError: (e) => {
            if (!toastId) return

            toast.error(e.message, {
                id: toastId
            })
        }
    })

    const form = useForm<DeliverFormSchemaType>({
        resolver: zodResolver(deliverFormSchema),
        mode: 'onSubmit'
    })

    function ProcessForm(values: DeliverFormSchemaType) {
        mutation.mutate({
            user_id: props.user_id,
            request_id: props.request_id,
            url: values.url
        })
    }

    return (
        <Form {...form}>
            <form
                className="flex flex-col gap-5"
                onSubmit={form.handleSubmit(ProcessForm)}
            >
                <FormField
                    control={form.control}
                    name="url"
                    render={({ field }) => (
                        <FormItem className="flex w-full flex-col gap-3">
                            <Label>URL:</Label>
                            <Input
                                {...field}
                                placeholder="https://example.com/file.zip"
                            />
                        </FormItem>
                    )}
                />
                <Button type="submit" disabled={props.delivered || mutation.isPending}>
                    Deliver Now!
                </Button>
            </form>
        </Form>
    )
}
