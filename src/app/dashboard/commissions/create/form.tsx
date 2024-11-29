'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { CircleDollarSign } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { useUploadThingContext } from '~/components/files/uploadthing-context'
import { Form, FormField, FormItem, FormLabel, FormMessage } from '~/components/ui/form'
import { Input } from '~/components/ui/input'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '~/components/ui/select'
import { Separator } from '~/components/ui/separator'
import { Textarea } from '~/components/ui/textarea'

import { CommissionAvailability } from '~/core/structures'
import { api } from '~/trpc/react'

const commissionSchema = z.object({
    title: z.string().min(2).max(64),
    description: z.string(),
    form_id: z.string(),
    price: z.number().min(0),
    max_commissions_until_waitlist: z.number().min(0),
    max_commissions_until_closed: z.number().min(0),
    commission_availability: z.enum([
        CommissionAvailability.Open,
        CommissionAvailability.Waitlist,
        CommissionAvailability.Closed
    ])
})

type CommissionSchemaType = z.infer<typeof commissionSchema>

export function CreateForm() {
    const { images, uploadImages, isUploading } = useUploadThingContext()
    const form = useForm<CommissionSchemaType>({
        resolver: zodResolver(commissionSchema),
        mode: 'onSubmit'
    })

    const createCommission = api.commission.set_commission.useMutation()

    return (
        <Form {...form}>
            <form className="mx-auto flex max-w-xl flex-col gap-5">
                <h1 className="text-2xl font-bold">Create Commission</h1>
                <Separator />
                <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Title:</FormLabel>
                            <Input
                                placeholder="My Commission"
                                className="bg-background-secondary"
                                {...field}
                                onChange={(e) => field.onChange(e.currentTarget.value)}
                            />
                            <FormMessage />
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
                                placeholder="Description"
                                {...field}
                                className="resize-none bg-background-secondary"
                                rows={8}
                            />
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="price"
                    render={({ field }) => (
                        <FormItem className="form-control">
                            <FormLabel className="label">Price:</FormLabel>
                            <div className="flex">
                                <div className="flex items-center justify-center rounded-l-md bg-background-tertiary px-5">
                                    <CircleDollarSign className="h-6 w-6" />
                                </div>
                                <Input
                                    placeholder="Starting Price"
                                    type="text"
                                    inputMode="numeric"
                                    className="w-full rounded-l-none bg-background-secondary"
                                    ref={field.ref}
                                    disabled={field.disabled}
                                    defaultValue={field.value ?? ''}
                                    onChange={(e) => {
                                        field.onChange(
                                            parseFloat(e.currentTarget.value) * 100
                                        )
                                    }}
                                />
                            </div>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <Separator />
                <FormField
                    control={form.control}
                    name="form_id"
                    render={({ field }) => (
                        <FormItem className="form-control">
                            <FormLabel className="label">User Form:</FormLabel>
                            <Select onValueChange={field.onChange}>
                                <SelectTrigger className="bg-background-secondary">
                                    <SelectValue placeholder="Select User Form" />
                                </SelectTrigger>
                                <SelectContent>
                                    {props.forms.map((form) => (
                                        <SelectItem key={form.id} value={form.id}>
                                            {form.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </form>
        </Form>
    )
}

export function UpdateForm() {
    return <>Update Form</>
}
