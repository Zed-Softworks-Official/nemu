'use client'

import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { CalendarIcon } from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { zodResolver } from '@hookform/resolvers/zod'

import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from '~/components/ui/form'

import { Input } from '~/components/ui/input'
import { Calendar } from '~/components/ui/calendar'
import { Button } from '~/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover'

import { cn } from '~/lib/utils'
import { api } from '~/trpc/react'
import { useRouter } from 'next/navigation'

const schema = z.object({
    name: z.string(),
    expires_at: z.date()
})

type Schema = z.infer<typeof schema>

export function CreateForm() {
    const router = useRouter()
    const form = useForm<Schema>({
        resolver: zodResolver(schema),
        mode: 'onSubmit',
        defaultValues: {
            name: '',
            expires_at: new Date()
        }
    })

    const createCon = api.con.set_con.useMutation({
        onMutate: () => {
            const toast_id = toast.loading('Creating con')

            return { toast_id }
        },
        onSuccess: (_, __, ctx) => {
            toast.success('Successfully created', {
                id: ctx.toast_id
            })

            router.push(`/admin/con`)
        },
        onError: (_, __, ctx) => {
            toast.error('Failed to create', {
                id: ctx?.toast_id
            })
        }
    })

    const process_form = (values: Schema) => {
        createCon.mutate(values)
    }

    return (
        <Form {...form}>
            <form
                className="mx-auto flex w-full max-w-xl flex-col gap-4"
                onSubmit={form.handleSubmit(process_form)}
            >
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Con Name:</FormLabel>
                            <FormControl>
                                <Input
                                    {...field}
                                    className="bg-background-secondary"
                                    placeholder="Con Name"
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="expires_at"
                    render={({ field }) => (
                        <FormItem className="flex flex-col gap-2">
                            <FormLabel>Expires at:</FormLabel>
                            <FormControl>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant={'outline'}
                                            className={cn(
                                                'border-background-tertiary bg-background-secondary w-[200px] justify-start text-left font-normal',
                                                !field.value && 'text-muted-foreground'
                                            )}
                                        >
                                            <CalendarIcon className="mr-2 size-4" />
                                            {field.value ? (
                                                format(field.value, 'PPP')
                                            ) : (
                                                <span>Pick a date</span>
                                            )}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0">
                                        <Calendar
                                            mode="single"
                                            selected={field.value}
                                            onSelect={field.onChange}
                                            initialFocus
                                        />
                                    </PopoverContent>
                                </Popover>
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <div className="flex w-full items-center justify-end">
                    <Button type="submit" disabled={createCon.isPending}>
                        Create
                    </Button>
                </div>
            </form>
        </Form>
    )
}
