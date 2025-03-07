'use client'

import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { Trash2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { useMemo } from 'react'

import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from '~/components/ui/form'

import { api, type RouterOutputs } from '~/trpc/react'
import { Input } from '~/components/ui/input'
import { Button } from '~/components/ui/button'
import NemuImage from '~/components/nemu-image'

import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogAction,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger
} from '~/components/ui/alert-dialog'
import { UploadDropzone } from '~/components/uploadthing'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { env } from '~/env'

const portfolioSchema = z.object({
    title: z.string().min(2).max(128),
    image: z.string().min(1)
})

type PortfolioSchemaType = z.infer<typeof portfolioSchema>

type PortfolioFormProps = {
    mode: 'create' | 'update'
    initialData?: {
        id: string
        title: string
        imageKey: string
        imageUrl: string
    }
}

function PortfolioForm(props: PortfolioFormProps) {
    const router = useRouter()

    const defaultValues = useMemo(() => {
        if (props.mode === 'create') {
            return {
                title: '',
                image: ''
            }
        }

        return {
            title: props.initialData?.title,
            image: props.initialData?.imageKey
        }
    }, [props.mode, props.initialData])

    const form = useForm<PortfolioSchemaType>({
        resolver: zodResolver(portfolioSchema),
        mode: 'onSubmit',
        defaultValues
    })

    const createPortfolio = api.portfolio.setPortfolio.useMutation({
        onMutate: () => {
            const toastId = toast.loading('Creating portfolio item')

            return { toastId }
        },
        onSuccess: (_, __, ctx) => {
            toast.success('Portfolio item created', {
                id: ctx.toastId
            })

            router.push('/dashboard/portfolio')
        },
        onError: (e, __, ctx) => {
            toast.error('Oh Nyo! Something went wrong', {
                id: ctx?.toastId,
                description: e.message
            })
        }
    })

    const updatePortfolio = api.portfolio.updatePortfolio.useMutation({
        onMutate: () => {
            const toastId = toast.loading('Updating Portfolio')

            return { toastId }
        },
        onSuccess: (_, __, ctx) => {
            toast.success('Portfolio item updated', {
                id: ctx.toastId
            })

            router.push(`/dashboard/portfolio/${props.initialData?.id}`)
        },
        onError: (e, __, ctx) => {
            toast.error('Oh Nyo! Something went wrong', {
                id: ctx?.toastId,
                description: e.message
            })
        }
    })

    const destroyPortfolio = api.portfolio.destroyPortfolio.useMutation({
        onMutate: () => {
            const toastId = toast.loading('Deleting portfolio item')

            return { toastId }
        },
        onSuccess: (_, __, ctx) => {
            toast.success('Portfolio item deleted', {
                id: ctx.toastId
            })
        },
        onError: (e, _, ctx) => {
            toast.error('Oh Nyo! Something went wrong', {
                id: ctx?.toastId,
                description: e.message
            })
        }
    })

    const mutation = props.mode === 'create' ? createPortfolio : updatePortfolio

    const processForm = async (values: PortfolioSchemaType) => {
        const commonData = { ...values }

        if (props.mode === 'create') {
            createPortfolio.mutate(commonData)
        } else if (props.initialData) {
            updatePortfolio.mutate({
                ...commonData,
                id: props.initialData.id
            })
        }
    }

    const cancelHref = useMemo(() => {
        if (props.mode === 'create') return '/dashboard/portfolio'

        return `/dashboard/portfolio/${props.initialData?.id}`
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
                                    placeholder="My portfolio item"
                                    {...field}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="image"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Image</FormLabel>
                            <UploadDropzone
                                endpoint={'portfolioUploader'}
                                onClientUploadComplete={(res) => {
                                    const image = res[0]?.key
                                    if (!image) {
                                        toast.error('An unexpected error occured')
                                        return
                                    }

                                    field.onChange(image)
                                }}
                                onUploadError={(error) => {
                                    toast.error('Oh Nyo! Something went wrong', {
                                        description: error.message
                                    })
                                }}
                            />
                            {form.watch('image') !== '' && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Preview</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="relative">
                                            <NemuImage
                                                src={`https://utfs.io/a/${env.NEXT_PUBLIC_UPLOADTHING_APP_ID}/${field.value}`}
                                                alt="Preview Image"
                                                width={200}
                                                height={200}
                                                className="rounded-md object-cover"
                                            />
                                            <Button
                                                variant={'ghost'}
                                                size={'icon'}
                                                className="absolute top-2 right-2"
                                                onClick={() => {
                                                    field.onChange('')
                                                }}
                                            >
                                                <span className="sr-only">Trash</span>
                                                <Trash2 className="size-4" />
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}
                        </FormItem>
                    )}
                />
                <div className="flex items-center justify-between">
                    <Button variant={'outline'} asChild>
                        <Link href={cancelHref}>
                            <XCircle className="size-4" />
                            Cancel
                        </Link>
                    </Button>
                    <div className="flex items-center gap-4">
                        {props.mode === 'update' && (
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button
                                        variant={'destructive'}
                                        disabled={
                                            destroyPortfolio.isPending ||
                                            destroyPortfolio.isSuccess
                                        }
                                    >
                                        Delete
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            This action cannot be undone.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction asChild>
                                            <Button
                                                onClick={(e) => {
                                                    e.preventDefault()
                                                    if (!props.initialData) return

                                                    destroyPortfolio.mutate({
                                                        id: props.initialData.id
                                                    })
                                                }}
                                            >
                                                Delete
                                            </Button>
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        )}
                        <Button
                            type="submit"
                            disabled={
                                (props.mode === 'create' && !form.formState.isValid) ||
                                mutation.isPending ||
                                mutation.isSuccess ||
                                destroyPortfolio.isPending ||
                                destroyPortfolio.isSuccess
                            }
                        >
                            {props.mode === 'create' ? 'Create' : 'Update'}
                        </Button>
                    </div>
                </div>
            </form>
        </Form>
    )
}

export function CreateForm() {
    return <PortfolioForm mode="create" />
}

export function UpdateForm(props: {
    portfolio: NonNullable<RouterOutputs['portfolio']['getPortfolioById']>
}) {
    return (
        <PortfolioForm
            mode="update"
            initialData={{
                id: props.portfolio.id,
                title: props.portfolio.title,
                imageKey: props.portfolio.image.utKey,
                imageUrl: props.portfolio.image.url
            }}
        />
    )
}
