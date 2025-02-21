'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { CircleDollarSign, XCircle } from 'lucide-react'
import Link from 'next/link'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import NemuUploadThing from '~/components/files/nemu-uploadthing'
import { useNemuUploadThing } from '~/components/files/uploadthing-context'
import { Button } from '~/components/ui/button'
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from '~/components/ui/form'
import { Input } from '~/components/ui/input'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '~/components/ui/select'
import { Separator } from '~/components/ui/separator'
import { Skeleton } from '~/components/ui/skeleton'
import { Slider } from '~/components/ui/slider'
import { Textarea } from '~/components/ui/textarea'

import {
    type ClientCommissionItemEditable,
    type ImageEditorData,
    type NemuEditImageData,
    chargeMethods,
    commissionAvalabilities
} from '~/lib/structures'

import { api } from '~/trpc/react'

const commissionSchema = z.object({
    title: z.string().min(2).max(64),
    description: z.string(),
    form_id: z.string(),
    price: z.string().refine((value) => !isNaN(Number(value))),
    max_commissions_until_waitlist: z.number().min(0),
    max_commissions_until_closed: z.number().min(0),
    commission_availability: z.enum(commissionAvalabilities),
    charge_method: z.enum(chargeMethods),
    downpayment_percentage: z.number().min(0).max(100)
})

type CommissionSchemaType = z.infer<typeof commissionSchema>

export function CreateForm() {
    const { images, uploadImages, isUploading } = useNemuUploadThing()
    const form = useForm<CommissionSchemaType>({
        resolver: zodResolver(commissionSchema),
        mode: 'onSubmit',
        defaultValues: {
            title: '',
            description: '',
            form_id: '',
            price: '0',
            max_commissions_until_waitlist: 0,
            max_commissions_until_closed: 0,
            commission_availability: 'open',
            charge_method: 'in_full',
            downpayment_percentage: 50
        }
    })

    const { data, isLoading: formsLoading } =
        api.request.get_forms_list_and_payment_method.useQuery()
    const createCommission = api.commission.set_commission.useMutation()

    const process_form = async (values: CommissionSchemaType) => {
        const toast_id = toast.loading('Uploading Images')

        // Check if we have images to upload
        if (images.length === 0) {
            toast.error('No images to upload', { id: toast_id })
            return
        }

        // Upload the images
        const res = await uploadImages()

        if (!res) {
            toast.error('Failed to upload images', { id: toast_id })
            return
        }

        // Format the images response to for the commission
        const uploaded_images = res.map((image) => ({
            ut_key: image.key
        }))

        // Update the toast
        toast.loading('Creating Commission', { id: toast_id })

        // Create the commission
        createCommission.mutate(
            {
                title: values.title,
                description: values.description,
                form_id: values.form_id,
                price: Number(values.price) * 100,
                max_commissions_until_waitlist: values.max_commissions_until_waitlist,
                max_commissions_until_closed: values.max_commissions_until_closed,
                images: uploaded_images,
                availability: values.commission_availability,
                published: false,
                charge_method: values.charge_method,
                downpayment_percentage: values.downpayment_percentage
            },
            {
                onError: (error) => {
                    toast.error(error.message, {
                        id: toast_id
                    })
                },
                onSuccess: () => {
                    toast.success('Commission Created', { id: toast_id })
                }
            }
        )
    }

    useEffect(() => {
        if (data) {
            form.setValue('charge_method', data.default_charge_method)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data])

    return (
        <Form {...form}>
            <form
                className="container mx-auto flex max-w-xl flex-col gap-5"
                onSubmit={form.handleSubmit(process_form)}
            >
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
                        <FormItem>
                            <FormLabel>Description:</FormLabel>
                            <Textarea
                                placeholder="Description"
                                {...field}
                                className="bg-background-secondary resize-none"
                                rows={8}
                                onChange={(e) => field.onChange(e.currentTarget.value)}
                            />
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="price"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Price:</FormLabel>
                            <div className="flex">
                                <div className="bg-background-tertiary flex items-center justify-center rounded-l-md px-5">
                                    <CircleDollarSign className="h-6 w-6" />
                                </div>
                                <Input
                                    placeholder="Starting Price"
                                    type="text"
                                    inputMode="numeric"
                                    className="bg-background-secondary w-full rounded-l-none"
                                    ref={field.ref}
                                    disabled={field.disabled}
                                    defaultValue={field.value ?? ''}
                                    onChange={field.onChange}
                                />
                            </div>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="charge_method"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Payment Method:</FormLabel>
                            <FormControl>
                                <Select
                                    value={field.value}
                                    onValueChange={field.onChange}
                                >
                                    <SelectTrigger className="bg-background-secondary">
                                        <SelectValue placeholder="Select Payment Method" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={'in_full'}>In Full</SelectItem>
                                        <SelectItem value={'down_payment'}>
                                            Down Payment
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </FormControl>
                        </FormItem>
                    )}
                />
                {form.watch('charge_method') === 'down_payment' && (
                    <FormField
                        control={form.control}
                        name="downpayment_percentage"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Down Payment Percentage:</FormLabel>
                                <div className="flex items-center justify-between gap-5">
                                    <FormControl>
                                        <Slider
                                            value={[field.value]}
                                            onValueChange={field.onChange}
                                            min={0}
                                            max={100}
                                            step={1}
                                        />
                                    </FormControl>
                                    <FormControl>
                                        <Input
                                            type="number"
                                            inputMode="numeric"
                                            className="bg-background-secondary w-[100px]"
                                            ref={field.ref}
                                            value={
                                                (field.value as unknown as number[])[0] ??
                                                field.value
                                            }
                                            onChange={(e) => {
                                                if (e.currentTarget.valueAsNumber > 100) {
                                                    toast.error(
                                                        'Down Payment Percentage cannot be greater than 100'
                                                    )
                                                    field.onChange(100)

                                                    return
                                                }

                                                if (e.currentTarget.valueAsNumber) {
                                                    field.onChange(
                                                        e.currentTarget.valueAsNumber
                                                    )
                                                }
                                            }}
                                        />
                                    </FormControl>
                                </div>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                )}
                <Separator />
                <FormField
                    control={form.control}
                    name="form_id"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>User Form:</FormLabel>
                            {formsLoading ? (
                                <div className="space-y-2">
                                    <Skeleton className="h-10 w-full" />
                                </div>
                            ) : (
                                <Select onValueChange={field.onChange}>
                                    <SelectTrigger className="bg-background-secondary">
                                        <SelectValue placeholder="Select User Form" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {data?.forms.map((form) => (
                                            <SelectItem key={form.id} value={form.id}>
                                                {form.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="commission_availability"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Availability:</FormLabel>
                            <Select onValueChange={field.onChange}>
                                <SelectTrigger className="bg-background-secondary">
                                    <SelectValue placeholder="Select Availability" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={'open'}>Open</SelectItem>
                                    <SelectItem value={'waitlist'}>Waitlist</SelectItem>
                                    Waitlist
                                    <SelectItem value={'closed'}>Closed</SelectItem>
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
                        <FormItem>
                            <FormLabel>Commissions Until Auto Waitlist:</FormLabel>
                            <Input
                                placeholder="0"
                                type="number"
                                inputMode="numeric"
                                className="bg-background-secondary"
                                ref={field.ref}
                                defaultValue={field.value}
                                disabled={field.disabled}
                                onChange={(e) => {
                                    if (e.currentTarget.valueAsNumber) {
                                        field.onChange(e.currentTarget.valueAsNumber)
                                    }
                                }}
                            />
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="max_commissions_until_closed"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Commissions Until Auto Close:</FormLabel>
                            <Input
                                placeholder="0"
                                type="number"
                                inputMode="numeric"
                                className="bg-background-secondary"
                                ref={field.ref}
                                disabled={field.disabled}
                                defaultValue={field.value}
                                onChange={(e) => {
                                    if (e.currentTarget.valueAsNumber) {
                                        field.onChange(e.currentTarget.valueAsNumber)
                                    }
                                }}
                            />
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <Separator />
                <NemuUploadThing />
                <Separator />
                <p className="text-muted-foreground">
                    <i>
                        Note: Commissions will need to be published. Make sure you have
                        created the commission form for users to fill out upon a request.
                    </i>
                </p>
                <div className="flex items-center justify-between">
                    <Button asChild variant={'outline'}>
                        <Link href={'/dashboard/commissions'}>
                            <XCircle className="h-6 w-6" />
                            Cancel
                        </Link>
                    </Button>
                    <Button
                        type="submit"
                        disabled={isUploading || createCommission.isPending}
                    >
                        Create Commission
                    </Button>
                </div>
            </form>
        </Form>
    )
}

const updateSchema = z.object({
    title: z.string().min(2).max(64),
    description: z.string(),
    form_name: z.string(),
    price: z.string().refine((value) => !isNaN(Number(value))),
    max_commissions_until_waitlist: z.number().min(0),
    max_commissions_until_closed: z.number().min(0),
    availability: z.enum(commissionAvalabilities),
    charge_method: z.enum(chargeMethods),
    downpayment_percentage: z.number().min(0).max(100)
})

type UpdateSchemaType = z.infer<typeof updateSchema>

export function UpdateForm(props: { commission: ClientCommissionItemEditable }) {
    const { images, uploadImages, isUploading } = useNemuUploadThing()

    const form = useForm<UpdateSchemaType>({
        resolver: zodResolver(updateSchema),
        mode: 'onSubmit',
        defaultValues: {
            ...props.commission
        }
    })

    const updateCommission = api.commission.update_commission.useMutation()

    const process_form = async (values: UpdateSchemaType) => {
        const toast_id = toast.loading('Uploading Images')

        const editor_state: {
            create: ImageEditorData[]
            update: ImageEditorData[]
            delete: ImageEditorData[]
        } = {
            create: [],
            update: [],
            delete: []
        }

        for (const image of images) {
            switch (image.data.action) {
                case 'create':
                    editor_state.create.push(image)
                    break
                case 'update':
                    editor_state.update.push(image)
                    break
                case 'delete':
                    editor_state.delete.push(image)
                    break
            }
        }

        let uploaded_images: NemuEditImageData[] = []

        // Check if we have any images to process
        const totalImagesAfterChanges =
            editor_state.create.length +
            editor_state.update.length -
            editor_state.delete.length

        // Validate total images won't exceed 6
        if (totalImagesAfterChanges > 6) {
            toast.error('Too many images!', {
                id: toast_id
            })
            return
        }

        // Only attempt upload if we have new images to create
        if (editor_state.create.length > 0) {
            const res = await uploadImages()

            if (!res) {
                toast.error('Uploading Images Failed!', {
                    id: toast_id
                })

                return
            }

            uploaded_images = res.map((file) => ({
                action: 'create',
                image_data: {
                    ut_key: file.key
                }
            }))
        }

        const images_to_update = uploaded_images
            .concat(
                editor_state.update.map((image) => ({
                    action: 'update',
                    image_data: {
                        ut_key: image.data.image_data.ut_key ?? ''
                    }
                }))
            )
            .map((image) => image.image_data.ut_key ?? '')

        updateCommission.mutate(
            {
                id: props.commission.id,
                data: {
                    title: values.title,
                    description: values.description,
                    price: Number(values.price) * 100,
                    max_commissions_until_closed: values.max_commissions_until_closed,
                    max_commissions_until_waitlist: values.max_commissions_until_waitlist,
                    availability: values.availability,
                    published: false,
                    images: images_to_update,
                    deleted_images: editor_state.delete.map(
                        (image) => image.data.image_data.ut_key ?? ''
                    ),
                    charge_method: values.charge_method,
                    downpayment_percentage: values.downpayment_percentage
                }
            },
            {
                onError: (error) => {
                    toast.error(error.message, {
                        id: toast_id
                    })
                },
                onSuccess: () => {
                    toast.success('Commission Updated', {
                        id: toast_id
                    })
                }
            }
        )
    }

    return (
        <Form {...form}>
            <form
                className="mt-5 flex flex-col gap-5"
                onSubmit={form.handleSubmit(process_form)}
            >
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
                        <FormItem>
                            <FormLabel>Description:</FormLabel>
                            <Textarea
                                placeholder="Description"
                                {...field}
                                className="bg-background-secondary resize-none"
                                rows={8}
                                onChange={(e) => field.onChange(e.currentTarget.value)}
                            />
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="price"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Price:</FormLabel>
                            <div className="flex">
                                <div className="bg-background-tertiary flex items-center justify-center rounded-l-md px-5">
                                    <CircleDollarSign className="h-6 w-6" />
                                </div>
                                <Input
                                    placeholder="Starting Price"
                                    type="text"
                                    inputMode="numeric"
                                    className="bg-background-secondary w-full rounded-l-none"
                                    ref={field.ref}
                                    disabled={field.disabled}
                                    defaultValue={field.value ?? ''}
                                    onChange={field.onChange}
                                />
                            </div>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="charge_method"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Payment Method:</FormLabel>
                            <FormControl>
                                <Select
                                    value={field.value}
                                    onValueChange={field.onChange}
                                >
                                    <SelectTrigger className="bg-background-secondary">
                                        <SelectValue placeholder="Select Payment Method" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={'in_full'}>In Full</SelectItem>
                                        <SelectItem value={'down_payment'}>
                                            Down Payment
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </FormControl>
                        </FormItem>
                    )}
                />
                {form.watch('charge_method') === 'down_payment' && (
                    <FormField
                        control={form.control}
                        name="downpayment_percentage"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Down Payment Percentage:</FormLabel>
                                <div className="flex items-center justify-between gap-5">
                                    <FormControl>
                                        <Slider
                                            value={[field.value]}
                                            onValueChange={field.onChange}
                                            min={0}
                                            max={100}
                                            step={1}
                                        />
                                    </FormControl>
                                    <FormControl>
                                        <Input
                                            type="number"
                                            inputMode="numeric"
                                            className="bg-background-secondary w-[100px]"
                                            ref={field.ref}
                                            value={
                                                (field.value as unknown as number[])[0] ??
                                                field.value
                                            }
                                            onChange={(e) => {
                                                if (e.currentTarget.valueAsNumber > 100) {
                                                    toast.error(
                                                        'Down Payment Percentage cannot be greater than 100'
                                                    )
                                                    field.onChange(100)

                                                    return
                                                }

                                                if (e.currentTarget.valueAsNumber) {
                                                    field.onChange(
                                                        e.currentTarget.valueAsNumber
                                                    )
                                                }
                                            }}
                                        />
                                    </FormControl>
                                </div>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                )}
                <Separator />
                <FormField
                    control={form.control}
                    name="form_name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>User Form:</FormLabel>
                            <Select value={field.value}>
                                <SelectTrigger
                                    disabled
                                    className="bg-background-secondary"
                                >
                                    <SelectValue placeholder="Select User Form" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={field.value}>
                                        {field.value}
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="availability"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Availability:</FormLabel>
                            <Select
                                value={field.value}
                                onValueChange={(value) => {
                                    if (!value) {
                                        return
                                    }

                                    field.onChange(value)
                                }}
                            >
                                <SelectTrigger className="bg-background-secondary">
                                    <SelectValue placeholder="Select Availability" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={'open'}>Open</SelectItem>
                                    <SelectItem value={'waitlist'}>Waitlist</SelectItem>
                                    <SelectItem value={'closed'}>Closed</SelectItem>
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
                        <FormItem>
                            <FormLabel>Commissions Until Auto Waitlist:</FormLabel>
                            <Input
                                placeholder="0"
                                type="number"
                                inputMode="numeric"
                                className="bg-background-secondary"
                                ref={field.ref}
                                defaultValue={field.value}
                                disabled={field.disabled}
                                onChange={(e) => {
                                    if (e.currentTarget.valueAsNumber) {
                                        field.onChange(e.currentTarget.valueAsNumber)
                                    }
                                }}
                            />
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="max_commissions_until_closed"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Commissions Until Auto Close:</FormLabel>
                            <Input
                                placeholder="0"
                                type="number"
                                inputMode="numeric"
                                className="bg-background-secondary"
                                ref={field.ref}
                                disabled={field.disabled}
                                defaultValue={field.value}
                                onChange={(e) => {
                                    if (e.currentTarget.valueAsNumber) {
                                        field.onChange(e.currentTarget.valueAsNumber)
                                    }
                                }}
                            />
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <Separator />
                <NemuUploadThing />
                <Separator />
                <p className="text-muted-foreground">
                    <i>
                        Note: Commissions will need to be published. Make sure you have
                        created the commission form for users to fill out upon a request.
                    </i>
                </p>
                <div className="flex items-center justify-between">
                    <Button asChild variant={'outline'}>
                        <Link href={'/dashboard/commissions'}>
                            <XCircle className="h-6 w-6" />
                            Cancel
                        </Link>
                    </Button>
                    <Button
                        type="submit"
                        disabled={isUploading || updateCommission.isPending}
                    >
                        Update Commission
                    </Button>
                </div>
            </form>
        </Form>
    )
}
