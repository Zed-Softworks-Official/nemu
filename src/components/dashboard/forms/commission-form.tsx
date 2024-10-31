'use client'

import Link from 'next/link'

import { z } from 'zod'
import { useCallback } from 'react'
import { useFormStatus } from 'react-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle2Icon, XCircleIcon, CircleDollarSignIcon } from 'lucide-react'
import { type InferSelectModel } from 'drizzle-orm'

import { CommissionAvailability } from '~/core/structures'
import type { forms } from '~/server/db/schema'

import { Form, FormField, FormItem, FormLabel, FormMessage } from '~/components/ui/form'
import { Input } from '~/components/ui/input'
import { Textarea } from '~/components/ui/textarea'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '~/components/ui/select'
import { Button } from '~/components/ui/button'

import NemuUploadThing from '~/components/files/nemu-uploadthing'
import { useUploadThingContext } from '~/components/files/uploadthing-context'

const commissionSchema = z.object({
    title: z.string().min(2).max(64),
    description: z.string(),
    form_id: z.string(),
    price: z.number().min(0),
    max_commissions_until_waitlist: z.number().min(0),
    max_commissions_until_closed: z.number().min(0),
    commission_availability: z.string()
})

type CommissionSchemaType = z.infer<typeof commissionSchema>

export function CommissionCreateForm(props: { forms: InferSelectModel<typeof forms>[] }) {
    const { uploadImages, isUploading } = useUploadThingContext()

    const form = useForm<CommissionSchemaType>({
        resolver: zodResolver(commissionSchema),
        mode: 'onSubmit'
    })

    const process_form = useCallback(async (values: CommissionSchemaType) => {
        // Upload Images
        // Create Commission
    }, [])

    return (
        <Form {...form}>
            <form
                className="mx-auto flex max-w-xl flex-col gap-5"
                onSubmit={form.handleSubmit(process_form)}
            >
                <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                        <FormItem className="form-control">
                            <FormLabel className="label">Title:</FormLabel>
                            <Input
                                placeholder="My Commission"
                                {...field}
                                className="bg-base-200"
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
                                className="resize-none bg-base-200"
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
                            <div className="join w-full">
                                <div className="join-item flex items-center justify-center bg-base-300 px-5">
                                    <CircleDollarSignIcon className="h-6 w-6" />
                                </div>
                                <Input
                                    placeholder="Starting Price"
                                    type="text"
                                    inputMode="numeric"
                                    className="join-item w-full bg-base-200"
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
                <div className="divider"></div>
                <FormField
                    control={form.control}
                    name="form_id"
                    render={({ field }) => (
                        <FormItem className="form-control">
                            <FormLabel className="label">User Form:</FormLabel>
                            <Select onValueChange={field.onChange}>
                                <SelectTrigger className="bg-base-200">
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
                <FormField
                    control={form.control}
                    name="commission_availability"
                    render={({ field }) => (
                        <FormItem className="form-control">
                            <FormLabel className="label">Availability:</FormLabel>
                            <Select onValueChange={field.onChange}>
                                <SelectTrigger className="bg-base-200">
                                    <SelectValue placeholder="Select Availability" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={CommissionAvailability.Open}>
                                        Open
                                    </SelectItem>
                                    <SelectItem value={CommissionAvailability.Waitlist}>
                                        Waitlist
                                    </SelectItem>
                                    <SelectItem value={CommissionAvailability.Closed}>
                                        Closed
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="max_commissions_until_waitlist"
                    render={({ field }) => (
                        <FormItem className="form-control">
                            <FormLabel className="label">
                                Commissions Until Auto Waitlist:
                            </FormLabel>
                            <Input
                                placeholder="0"
                                type="number"
                                inputMode="numeric"
                                className="bg-base-200"
                                ref={field.ref}
                                defaultValue={field.value}
                                disabled={field.disabled}
                                onChange={(e) =>
                                    field.onChange(e.currentTarget.valueAsNumber)
                                }
                            />
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="max_commissions_until_closed"
                    render={({ field }) => (
                        <FormItem className="form-control">
                            <FormLabel className="label">
                                Commissions Until Auto Close:
                            </FormLabel>
                            <Input
                                placeholder="0"
                                type="number"
                                inputMode="numeric"
                                className="bg-base-200"
                                ref={field.ref}
                                disabled={field.disabled}
                                defaultValue={field.value}
                                onChange={(e) =>
                                    field.onChange(e.currentTarget.valueAsNumber)
                                }
                            />
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <div className="divider"></div>
                <NemuUploadThing />
                <div className="divider"></div>
                <p className="text-base-content/80">
                    <i>
                        Note: Commissions will need to be published. Make sure you have
                        created the commission form for users to fill out upon a request.
                    </i>
                </p>
                <div className="flex items-center justify-between">
                    <Link
                        className="btn btn-outline btn-error"
                        href={'/dashboard/commissions'}
                    >
                        <XCircleIcon className="h-6 w-6" />
                        Cancel
                    </Link>
                    <SubmitButton is_uploading={isUploading} />
                </div>
            </form>
        </Form>
    )
}

function SubmitButton(props: { is_uploading: boolean }) {
    const { pending } = useFormStatus()

    return (
        <Button type="submit" disabled={props.is_uploading || pending}>
            <CheckCircle2Icon className="h-6 w-6" />
            Create
        </Button>
    )
}
