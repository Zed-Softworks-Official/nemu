'use client'

import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { notFound, useRouter } from 'next/navigation'

import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from '~/components/ui/form'

import { Separator } from '~/components/ui/separator'
import { api } from '~/trpc/react'
import { Input } from '~/components/ui/input'
import { useNemuUploadThing } from '~/components/files/uploadthing-context'
import { NemuSingleDropzone } from '~/components/files/nemu-uploadthing'
import { Button } from '~/components/ui/button'
import Loading from '~/components/ui/loading'
import { useEffect } from 'react'
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

const schema = z.object({
    title: z.string().min(2).max(128)
})

type SchemaType = z.infer<typeof schema>

export function CreateForm() {
    const { uploadImages } = useNemuUploadThing()
    const createPortfolio = api.portfolio.set_portfolio.useMutation()

    const form = useForm<SchemaType>({
        resolver: zodResolver(schema),
        mode: 'onSubmit',
        defaultValues: {
            title: ''
        }
    })

    const process_form = async (values: SchemaType) => {
        const toast_id = toast.loading('Uploading Images')
        const res = await uploadImages()
        if (!res) {
            toast.error('Failed to upload images', {
                id: toast_id
            })

            return
        }

        toast.loading('Creating Portfolio Item', {
            id: toast_id
        })

        await createPortfolio.mutateAsync(
            {
                title: values.title,
                ut_key: res[0]?.key ?? ''
            },
            {
                onError: (e) => {
                    toast.error(e.message, {
                        id: toast_id
                    })
                },
                onSuccess: () => {
                    toast.success('Portfolio Item Created', {
                        id: toast_id
                    })
                }
            }
        )
    }

    return (
        <Form {...form}>
            <form
                onSubmit={form.handleSubmit(process_form)}
                className="mx-auto flex w-full max-w-xl flex-col gap-5"
            >
                <h1 className="text-2xl font-bold">Create Portfolio</h1>
                <Separator />
                <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Title</FormLabel>
                            <FormControl>
                                <Input
                                    {...field}
                                    placeholder="My Beautiful Artwork"
                                    className="bg-background-secondary"
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <NemuSingleDropzone />
                <div className="flex w-full justify-between">
                    <Button asChild variant={'outline'}>
                        <Link href="/dashboard/portfolio">
                            <XCircle className="h-6 w-6" />
                            Cancel
                        </Link>
                    </Button>
                    <Button type="submit">Create</Button>
                </div>
            </form>
        </Form>
    )
}

export function UpdateForm(props: { id: string }) {
    const router = useRouter()
    const utils = api.useUtils()

    const updatePortfolio = api.portfolio.update_portfolio.useMutation({
        onMutate: () => {
            const toast_id = toast.loading('Updating Portfolio')

            return {
                toast_id
            }
        },
        onError: (e, _, context) => {
            toast.error(e.message, {
                id: context?.toast_id
            })
        },
        onSuccess: (_, __, context) => {
            toast.success('Portfolio Updated', {
                id: context?.toast_id
            })

            void utils.portfolio.get_portfolio_list.invalidate()
            router.push('/dashboard/portfolio')
        }
    })

    const destroyPortfolio = api.portfolio.destroy_portfolio.useMutation({
        onMutate: () => {
            const toast_id = toast.loading('Deleting Portfolio')

            return {
                toast_id
            }
        },
        onError: (e, _, context) => {
            toast.error(e.message, {
                id: context?.toast_id
            })
        },
        onSuccess: (_, __, context) => {
            toast.success('Portfolio Deleted', {
                id: context?.toast_id
            })

            void utils.portfolio.get_portfolio_list.invalidate()
            router.push('/dashboard/portfolio')
        }
    })

    const { data: portfolio, isLoading } = api.portfolio.get_portfolio_by_id.useQuery({
        id: props.id
    })

    const form = useForm<SchemaType>({
        resolver: zodResolver(schema),
        mode: 'onSubmit',
        defaultValues: {
            title: portfolio?.title ?? ''
        }
    })

    const process_form = async (values: SchemaType) => {
        updatePortfolio.mutate({
            id: props.id,
            title: values.title
        })
    }

    useEffect(() => {
        if (portfolio) {
            form.reset({
                title: portfolio.title
            })
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [portfolio])

    if (isLoading) {
        return <Loading />
    }

    if (!portfolio) {
        return notFound()
    }

    return (
        <AlertDialog>
            <Form {...form}>
                <form
                    className="flex flex-col gap-5"
                    onSubmit={form.handleSubmit(process_form)}
                >
                    <FormField
                        control={form.control}
                        name="title"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Title</FormLabel>
                                <FormControl>
                                    <Input
                                        {...field}
                                        placeholder="My Beautiful Artwork"
                                        className="bg-background-secondary"
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <NemuImage
                        src={portfolio.image.url}
                        alt={portfolio.title}
                        className="h-full w-full rounded-xl"
                        width={300}
                        height={300}
                    />
                    <div className="flex w-full justify-between">
                        <Button asChild variant={'outline'}>
                            <Link href="/dashboard/portfolio">
                                <XCircle className="h-6 w-6" />
                                Cancel
                            </Link>
                        </Button>
                        <div className="flex gap-2">
                            <Button type="submit">Update</Button>
                            <AlertDialogTrigger asChild>
                                <Button type="button" variant={'destructive'}>
                                    Delete
                                </Button>
                            </AlertDialogTrigger>
                        </div>
                    </div>
                </form>
            </Form>
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
                            variant={'destructive'}
                            className="bg-destructive!"
                            onClick={() => {
                                destroyPortfolio.mutate({
                                    id: props.id
                                })
                            }}
                        >
                            Delete
                        </Button>
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
