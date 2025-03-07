'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { CircleDollarSign, Trash2, XCircle } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import type { JSONContent } from '@tiptap/react'
import { UploadDropzone } from '~/components/uploadthing'
import NemuImage from '~/components/nemu-image'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from '~/components/ui/form'
import { Input } from '~/components/ui/input'
import { MarkdownEditor } from '~/components/ui/markdown-editor'
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
import { env } from '~/env'

import {
    type ChargeMethod,
    chargeMethods,
    type CommissionAvailability,
    commissionAvalabilities
} from '~/lib/types'

import { api, type RouterOutputs } from '~/trpc/react'
import { useRouter } from 'next/navigation'

const commissionSchema = z.object({
    title: z.string().min(2).max(64),
    description: z.any(),
    formId: z.string(),
    images: z.array(z.string()).min(1),
    price: z.string().refine((value) => !isNaN(Number(value))),
    maxCommissionsUntilWaitlist: z.number().min(0),
    maxCommissionsUntilClosed: z.number().min(0),
    commissionAvailability: z.enum(commissionAvalabilities),
    chargeMethod: z.enum(chargeMethods),
    downpaymentPercentage: z.number().min(0).max(100)
})

type CommissionSchemaType = z.infer<typeof commissionSchema>

type CommissionFormProps = {
    mode: 'create' | 'update'
    initialData?: {
        id: string
        title: string
        description: JSONContent
        price: number
        formId: string
        images: {
            url: string
            utKey: string
        }[]
        maxCommissionsUntilWaitlist: number
        maxCommissionsUntilClosed: number
        commissionAvailability: CommissionAvailability
        chargeMethod: ChargeMethod
        downpaymentPercentage: number
        slug: string
        published: boolean
    }
}

function CommissionForm(props: CommissionFormProps) {
    const { data: formsData, isLoading: formsLoading } =
        api.request.getFormsListAndPaymentMethod.useQuery()
    const router = useRouter()
    const defaultValues = useMemo(() => {
        if (props.mode === 'create') {
            return {
                title: '',
                description: '',
                formId: '',
                images: [],
                price: '0',
                maxCommissionsUntilWaitlist: 0,
                maxCommissionsUntilClosed: 0,
                commissionAvailability: 'open' as CommissionAvailability,
                chargeMethod: 'in_full' as ChargeMethod,
                downpaymentPercentage: 0
            }
        }

        return {
            title: props.initialData?.title,
            description: props.initialData?.description,
            formId: props.initialData?.formId,
            images: props.initialData?.images.map((image) => image.utKey),
            price: ((props.initialData?.price ?? 0) / 100).toFixed(2),
            maxCommissionsUntilWaitlist: props.initialData?.maxCommissionsUntilWaitlist,
            maxCommissionsUntilClosed: props.initialData?.maxCommissionsUntilClosed,
            commissionAvailability: props.initialData?.commissionAvailability,
            chargeMethod: props.initialData?.chargeMethod,
            downpaymentPercentage: props.initialData?.downpaymentPercentage
        }
    }, [props])

    const form = useForm<CommissionSchemaType>({
        resolver: zodResolver(commissionSchema),
        mode: 'onSubmit',
        defaultValues
    })

    const createCommission = api.commission.setCommission.useMutation({
        onMutate: () => {
            const toastId = toast.loading('Creating Commission')

            return { toastId }
        },
        onSuccess: (_, __, ctx) => {
            toast.success('Commission Created', {
                id: ctx.toastId
            })
            router.push('/dashboard/commissions')
        },
        onError: (_, __, ctx) => {
            toast.error('Failed to create commission', {
                id: ctx?.toastId
            })
        }
    })

    const updateCommission = api.commission.updateCommission.useMutation({
        onMutate: () => {
            const toastId = toast.loading('Updating Commission')
            return { toastId }
        },
        onSuccess: (_, __, ctx) => {
            toast.success('Commission Updated', {
                id: ctx.toastId
            })
            router.push('/dashboard/commissions')
        },
        onError: (_, __, ctx) => {
            toast.error('Failed to update commission', {
                id: ctx?.toastId
            })
        }
    })

    useDefaultPaymentStructure({
        defaultChargeMethod: formsData?.defaultChargeMethod,
        onChange: (value) => form.setValue('chargeMethod', value),
        mode: props.mode
    })

    const mutation = props.mode === 'create' ? createCommission : updateCommission

    const processForm = async (data: CommissionSchemaType) => {
        const commonData = {
            ...data,
            price: Number(data.price) * 100,
            published: false
        }

        if (props.mode === 'create') {
            createCommission.mutate(commonData)
        } else if (props.initialData) {
            updateCommission.mutate({
                ...commonData,
                id: props.initialData.id
            })
        }
    }

    const cancelHref = useMemo(() => {
        if (props.mode === 'create') return '/dashboard/commissions'

        return `/dashboard/commissions/${props.initialData?.slug}`
    }, [props.mode, props.initialData])

    return (
        <Form {...form}>
            <form
                className="flex flex-col gap-4"
                onSubmit={form.handleSubmit(processForm)}
            >
                <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Title:</FormLabel>
                            <FormControl>
                                <Input
                                    className="bg-secondary"
                                    placeholder="My amazing commission"
                                    {...field}
                                />
                            </FormControl>
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
                            <FormControl>
                                <MarkdownEditor
                                    content={
                                        props.mode === 'update'
                                            ? props.initialData?.description
                                            : undefined
                                    }
                                    onUpdate={field.onChange}
                                    placeholder="Write a description for your commission"
                                />
                            </FormControl>
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
                                    <CircleDollarSign className="size-6" />
                                </div>
                                <Input
                                    placeholder="Starting Price"
                                    type="text"
                                    inputMode="numeric"
                                    className="bg-background-secondary w-full rounded-l-none"
                                    {...field}
                                />
                            </div>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="chargeMethod"
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
                {form.watch('chargeMethod') === 'down_payment' && (
                    <FormField
                        control={form.control}
                        name="downpaymentPercentage"
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
                                                if (
                                                    isNaN(e.currentTarget.valueAsNumber)
                                                ) {
                                                    toast.error(
                                                        'Please enter a valid number'
                                                    )

                                                    return
                                                }
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
                    name="formId"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>User Form:</FormLabel>
                            {formsLoading ? (
                                <div className="space-y-2">
                                    <Skeleton className="h-10 w-full" />
                                </div>
                            ) : (
                                <Select
                                    value={field.value}
                                    onValueChange={field.onChange}
                                >
                                    <SelectTrigger className="bg-background-secondary">
                                        <SelectValue placeholder="Select User Form" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {formsData?.forms.map((form) => (
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
                    name="commissionAvailability"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Availability:</FormLabel>
                            <Select value={field.value} onValueChange={field.onChange}>
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
                    name="maxCommissionsUntilWaitlist"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Commissions Until Auto Waitlist:</FormLabel>
                            <Input
                                placeholder="0"
                                type="number"
                                inputMode="numeric"
                                className="bg-background-secondary"
                                {...field}
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
                    name="maxCommissionsUntilClosed"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Commissions Until Auto Close:</FormLabel>
                            <Input
                                placeholder="0"
                                type="number"
                                inputMode="numeric"
                                className="bg-background-secondary"
                                {...field}
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
                <FormField
                    control={form.control}
                    name="images"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Images:</FormLabel>
                            <UploadDropzone
                                endpoint={'commissionImageUploader'}
                                onClientUploadComplete={(res) => {
                                    field.onChange(res.map((image) => image.key))
                                }}
                                onUploadError={(error) => {
                                    toast.error('Oh Nyo! Something went wrong', {
                                        description: error.message
                                    })
                                }}
                            />
                            {field.value.length > 0 && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Preview</CardTitle>
                                    </CardHeader>
                                    <CardContent className="flex gap-2 overflow-x-auto">
                                        {field.value.map((image) => (
                                            <div className="relative" key={image}>
                                                <NemuImage
                                                    src={`https://utfs.io/a/${env.NEXT_PUBLIC_UPLOADTHING_APP_ID}/${image}`}
                                                    alt="commission image"
                                                    width={200}
                                                    height={200}
                                                    className="rounded-md object-cover"
                                                />
                                                <Button
                                                    variant={'ghost'}
                                                    size="icon"
                                                    className="absolute top-2 right-2"
                                                    onClick={() => {
                                                        field.onChange(
                                                            field.value.filter(
                                                                (i) => i !== image
                                                            )
                                                        )
                                                    }}
                                                >
                                                    <span className="sr-only">Trash</span>
                                                    <Trash2 className="size-4" />
                                                </Button>
                                            </div>
                                        ))}
                                    </CardContent>
                                </Card>
                            )}
                        </FormItem>
                    )}
                />

                <Separator />
                <p className="text-muted-foreground italic">
                    Note: Commissions will need to be published. Make sure you have
                    created the commission form for users to fill out upon a request.
                </p>
                <div className="flex items-center justify-between">
                    <Button variant={'outline'} asChild>
                        <Link href={cancelHref}>
                            <XCircle className="size-4" />
                            Cancel
                        </Link>
                    </Button>
                    <Button
                        type="submit"
                        disabled={
                            (props.mode === 'create' && !form.formState.isValid) ||
                            mutation.isPending ||
                            mutation.isSuccess
                        }
                    >
                        {props.mode === 'create' ? 'Create' : 'Update'}
                    </Button>
                </div>
            </form>
        </Form>
    )
}

function useDefaultPaymentStructure(props: {
    defaultChargeMethod?: ChargeMethod
    onChange: (value: ChargeMethod) => void
    mode: 'create' | 'update'
}) {
    useEffect(() => {
        if (props.defaultChargeMethod && props.mode === 'create') {
            props.onChange(props.defaultChargeMethod)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.mode])
}

export function CreateForm() {
    return <CommissionForm mode="create" />
}

export function UpdateForm(props: {
    commission: NonNullable<RouterOutputs['commission']['getCommissionByIdDashboard']>
}) {
    return (
        <CommissionForm
            mode="update"
            initialData={{
                id: props.commission.id,
                formId: props.commission.formId,
                title: props.commission.title,
                description: props.commission.description,
                images: props.commission.images,
                price: props.commission.price,
                chargeMethod: props.commission.chargeMethod,
                maxCommissionsUntilClosed: props.commission.maxCommissionsUntilClosed,
                maxCommissionsUntilWaitlist: props.commission.maxCommissionsUntilWaitlist,
                commissionAvailability: props.commission.availability,
                downpaymentPercentage: props.commission.downpaymentPercentage,
                slug: props.commission.slug,
                published: props.commission.published
            }}
        />
    )
}
