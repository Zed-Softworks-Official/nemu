'use client'

import Link from 'next/link'

import { z } from 'zod'
import { useCallback } from 'react'
import { useFormStatus } from 'react-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle2Icon, XCircleIcon, CircleDollarSignIcon } from 'lucide-react'
import { type InferSelectModel } from 'drizzle-orm'
import { toast } from 'sonner'

import { CommissionAvailability } from '~/core/structures'
import type { commissions, forms } from '~/server/db/schema'

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

import { set_commission } from '~/server/actions/commission'

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

/**
 * Commission Create Form Component
 */
export function CommissionCreateForm(props: { forms: InferSelectModel<typeof forms>[] }) {
    const { images, uploadImages, isUploading } = useUploadThingContext()

    const form = useForm<CommissionSchemaType>({
        resolver: zodResolver(commissionSchema),
        mode: 'onSubmit'
    })

    const process_form = async (values: CommissionSchemaType) => {
        const toast_id = toast.loading('Uploading Images')

        // Check if we have images to upload
        if (images.length === 0) {
            toast.error('Images are required!', {
                id: toast_id
            })

            return
        }

        // Upload Images
        const res = await uploadImages()

        if (!res) {
            toast.error('Failed to upload images!', {
                id: toast_id
            })

            return
        }

        // Format images response to be commission creation
        const uploaded_images = res.map((file) => ({
            url: file.url,
            ut_key: file.key
        }))

        // Update toast
        toast.loading('Creating Commission', {
            id: toast_id
        })

        // Create Commission
        const commission_res = await set_commission({
            title: values.title,
            description: values.description,
            price: values.price,
            availability: values.commission_availability as CommissionAvailability,
            images: uploaded_images,
            form_id: values.form_id,
            max_commissions_until_waitlist: values.max_commissions_until_waitlist,
            max_commissions_until_closed: values.max_commissions_until_closed
        })

        if (!commission_res.success) {
            toast.error('Failed to create commission!', {
                id: toast_id
            })

            return
        }

        toast.success('Commission Created!', {
            id: toast_id
        })
    }

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

/**
 * Commission Update Form Component
 */
export function CommissionUpdateForm(props: {
    form: InferSelectModel<typeof forms>
    commission: InferSelectModel<typeof commissions>
}) {
    return <></>
}

/**
 * Submit Button Component
 */
function SubmitButton(props: { is_uploading: boolean }) {
    const { pending } = useFormStatus()

    return (
        <Button type="submit" disabled={props.is_uploading || pending}>
            <CheckCircle2Icon className="h-6 w-6" />
            Create
        </Button>
    )
}
