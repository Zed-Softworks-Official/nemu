'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle2Icon, CircleDollarSignIcon, XCircleIcon } from 'lucide-react'
import { useTheme } from 'next-themes'
import Link from 'next/link'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Id } from 'react-toastify'

import { z } from 'zod'

import NemuUploadThing from '~/components/files/nemu-uploadthing'
import { useUploadThingContext } from '~/components/files/uploadthing-context'
import { Button } from '~/components/ui/button'
import { Form, FormField, FormItem, FormLabel } from '~/components/ui/form'
import { Input } from '~/components/ui/input'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '~/components/ui/select'
import { Textarea } from '~/components/ui/textarea'
import { CommissionAvailability, RouterOutput } from '~/core/structures'
import { nemu_toast } from '~/lib/utils'
import { api } from '~/trpc/react'

/**
 * Commission schema for zod
 */
const commissionSchema = z.object({
    title: z.string().min(2).max(50),
    description: z.string().min(10).max(500),
    form_id: z.string(),

    price: z.preprocess(
        (value) => parseInt(z.string().parse(value), 10),
        z.number().min(0).default(0)
    ),

    // rush: z.boolean().default(false),
    // rush_charge: z.number().default(0).optional(),
    // rush_percentage: z.boolean().default(false),

    max_commissions_until_waitlist: z.preprocess(
        (value) => parseInt(z.string().parse(value), 10),
        z.number().min(0).default(0).optional()
    ),
    max_commissions_until_closed: z.preprocess(
        (value) => parseInt(z.string().parse(value), 10),
        z.number().min(0).default(0).optional()
    ),

    commission_availability: z.preprocess(
        (value) => parseInt(z.string().parse(value), 10),
        z.number()
    )
})

/**
 * Create a type from the zod schema
 */
type CommissionSchemaType = z.infer<typeof commissionSchema>

/**
 * The actual create/edit form
 */
export default function CommissionCreateEditForm({
    forms,
    edit_data
}: {
    forms: RouterOutput['form']['get_form_list']
    edit_data?: RouterOutput['commission']['get_commission']
}) {
    const [toastId, setToastId] = useState<Id | undefined>()

    const { resolvedTheme } = useTheme()
    const { files, uploadImages, isUploading } = useUploadThingContext()

    const mutation = api.commission.set_commission.useMutation({
        onSuccess: () => {
            if (!toastId) return

            nemu_toast.update(toastId, {
                render: 'Commission created!',
                isLoading: false,
                autoClose: 5000,
                type: 'success'
            })
        },
        onError: (e) => {
            if (!toastId) return

            nemu_toast.update(toastId, {
                render: e.message,
                isLoading: false,
                autoClose: 5000,
                type: 'error'
            })
        }
    })

    const form = useForm<CommissionSchemaType>({
        resolver: zodResolver(commissionSchema),
        mode: 'onSubmit',
        defaultValues: {
            title: edit_data?.title ?? '',
            description: edit_data?.description ?? '',
            price: edit_data?.raw_price ?? 0,
            form_id: edit_data?.form_id ?? '',
            max_commissions_until_waitlist:
                edit_data?.max_commissions_until_waitlist ?? 0,
            max_commissions_until_closed: edit_data?.max_commissions_until_closed ?? 0
        }
    })

    async function ProcessForm(values: CommissionSchemaType) {
        // Create Toast
        setToastId(nemu_toast.loading('Uploading Files', { theme: resolvedTheme }))

        if (!toastId) {
            return
        }

        //////////////////////////////////////////
        // Update Commission
        //////////////////////////////////////////
        // If edit_data is present then that means we are editing a commission
        if (edit_data) {
            // Check if we have images to upload
            if (files.length === 0) {
                const res = await uploadImages()

                if (!res) {
                    nemu_toast.update(toastId, {
                        render: 'Uploading Images Failed!',
                        isLoading: false,
                        autoClose: 5000,
                        type: 'error'
                    })

                    return
                }
            }

            // Update the commission item
            mutation.mutate({
                type: 'update',
                commission_id: edit_data.id!,
                data: {
                    title: values.title,
                    description: values.description,
                    price: values.price,
                    availability: values.commission_availability,
                    form_id: values.form_id,
                    max_commissions_until_waitlist: values.max_commissions_until_waitlist,
                    max_commissions_until_closed: values.max_commissions_until_closed
                    // images
                    // utKeys
                }
            })

            return
        }

        //////////////////////////////////////////
        // Create Commission
        //////////////////////////////////////////
        // Check if we have images to upload
        if (files.length === 0) {
            nemu_toast.update(toastId, {
                render: 'Images are required!',
                isLoading: false,
                autoClose: 5000,
                type: 'error'
            })

            return
        }

        // Upload Images
        const res = await uploadImages()

        if (!res) {
            nemu_toast.update(toastId, {
                render: 'Uploading Images Failed!',
                isLoading: false,
                autoClose: 5000,
                type: 'error'
            })

            return
        }

        // Grab image urls and utKeys from response
        const images: string[] = []
        const utKeys: string[] = []

        for (const item of res) {
            images.push(item.url)
            utKeys.push(item.key)
        }

        // Update Toast
        nemu_toast.update(toastId, {
            render: 'Creating Commission'
        })

        // Create the new commission item
        mutation.mutate({
            type: 'create',
            data: {
                title: values.title,
                description: values.description,
                price: values.price,
                availability: values.commission_availability,
                images: images,
                utKeys: utKeys,
                form_id: values.form_id,
                max_commissions_until_waitlist: values.max_commissions_until_waitlist,
                max_commissions_until_closed: values.max_commissions_until_closed
            }
        })
    }

    return (
        <Form {...form}>
            <form
                className="flex flex-col gap-5 max-w-xl mx-auto"
                onSubmit={form.handleSubmit(ProcessForm)}
            >
                <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                        <FormItem className="form-control">
                            <FormLabel className="label">Title:</FormLabel>
                            <Input placeholder="My Commission" {...field} />
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
                                className="resize-none"
                                rows={8}
                            />
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
                                <div className="flex items-center justify-center px-5 bg-base-200 join-item">
                                    <CircleDollarSignIcon className="w-6 h-6" />
                                </div>
                                <Input
                                    placeholder="Starting Price"
                                    type="number"
                                    inputMode="numeric"
                                    className="w-full join-item"
                                    {...field}
                                />
                            </div>
                        </FormItem>
                    )}
                />
                <div className="divider"></div>
                {forms && (
                    <FormField
                        control={form.control}
                        name="form_id"
                        render={({ field }) => (
                            <FormItem className="form-control">
                                <FormLabel className="label">User Form:</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={edit_data?.form_id}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select User Form" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {forms.map((form) => (
                                            <SelectItem key={form.id} value={form.id}>
                                                {form.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </FormItem>
                        )}
                    />
                )}
                <FormField
                    control={form.control}
                    name="commission_availability"
                    render={({ field }) => (
                        <FormItem className="form-control">
                            <FormLabel className="label">Availability:</FormLabel>
                            <Select
                                onValueChange={field.onChange}
                                defaultValue={`${edit_data?.availability}`}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select Availability" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={`${CommissionAvailability.Open}`}>
                                        Open
                                    </SelectItem>
                                    <SelectItem
                                        value={`${CommissionAvailability.Waitlist}`}
                                    >
                                        Waitlist
                                    </SelectItem>
                                    <SelectItem
                                        value={`${CommissionAvailability.Closed}`}
                                    >
                                        Closed
                                    </SelectItem>
                                </SelectContent>
                            </Select>
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
                                {...field}
                            />
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
                                {...field}
                            />
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
                <div className="flex justify-between items-center">
                    <Link
                        className="btn btn-outline btn-error"
                        href={'/dashboard/commissions'}
                    >
                        <XCircleIcon className="w-6 h-6" />
                        Cancel
                    </Link>
                    <Button type="submit" disabled={isUploading || mutation.isPending}>
                        <CheckCircle2Icon className="w-6 h-6" />
                        {edit_data ? 'Update' : 'Create'}
                    </Button>
                </div>
            </form>
        </Form>
    )
}
