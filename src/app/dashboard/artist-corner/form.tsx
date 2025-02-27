'use client'

import Image from 'next/image'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { z } from 'zod'

import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import { Trash2 } from 'lucide-react'

import { UploadDropzone } from '~/components/files/uploadthing'
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

import { env } from '~/env'
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from '~/components/ui/card'
import { Switch } from '~/components/ui/switch'

import { format_file_size } from '~/lib/utils'
import { type DownloadData } from '~/lib/structures'

import { api, type RouterOutputs } from '~/trpc/react'
import { type JSONContent } from '@tiptap/react'

const MarkdownEditor = dynamic(
    () => import('~/components/ui/markdown-editor').then((mod) => mod.MarkdownEditor),
    {
        ssr: false
    }
)

const productSchema = z.object({
    name: z.string().min(2).max(64),
    description: z.any(),
    price: z
        .string()
        .refine((val) => !isNaN(Number(val)), {
            message: 'Price must be a number'
        })
        .refine((val) => Number(val) >= 1, {
            message: 'Price must be greater than 0'
        }),
    images: z.array(z.string()).min(1).max(5),
    download: z.string().min(1),
    is_free: z.boolean()
})

type ProductSchemaType = z.infer<typeof productSchema>

export function CreateForm() {
    const [currentFile, setCurrentFile] = useState<DownloadData | undefined>()
    const router = useRouter()

    const form = useForm<ProductSchemaType>({
        resolver: zodResolver(productSchema),
        mode: 'onSubmit',
        defaultValues: {
            name: '',
            description: '',
            price: '1.00',
            images: [],
            download: '',
            is_free: false
        }
    })

    const createProduct = api.artist_corner.set_product.useMutation({
        onMutate: () => {
            const toast_id = toast.loading('Creating Product')

            return { toast_id }
        },
        onSuccess: (_, __, ctx) => {
            toast.success('Product Created', {
                id: ctx.toast_id
            })

            router.push('/dashboard/artist-corner')
        },
        onError: (_, __, ctx) => {
            toast.error('Failed to create product', {
                id: ctx?.toast_id
            })
        }
    })

    const process_form = async (data: ProductSchemaType) => {
        if (!currentFile) {
            toast.error('Download File Invalid')
            return
        }

        createProduct.mutate({
            ...data,
            price: Number(data.price) * 100,
            download: currentFile,
            description: data.description as JSONContent
        })
    }

    return (
        <Form {...form}>
            <form
                className="flex flex-col gap-4"
                onSubmit={form.handleSubmit(process_form)}
            >
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Name:</FormLabel>
                            <FormControl>
                                <Input
                                    className="bg-secondary"
                                    placeholder="Product Name"
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
                                <MarkdownEditor onUpdate={field.onChange} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormItem>
                    <FormLabel>Images:</FormLabel>
                    <UploadDropzone
                        endpoint={'productImageUploader'}
                        onClientUploadComplete={(res) => {
                            form.setValue(
                                'images',
                                res.map((image) => image.key)
                            )
                        }}
                        onUploadError={(error) => {
                            toast.error('Oh Nyo! Something went wrong', {
                                description: error.message
                            })
                        }}
                    />
                    {form.watch('images').length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Preview</CardTitle>
                            </CardHeader>
                            <CardContent className="flex gap-2 overflow-x-auto">
                                {form.watch('images').map((image) => (
                                    <div className="relative" key={image}>
                                        <Image
                                            src={`https://utfs.io/a/${env.NEXT_PUBLIC_UPLOADTHING_APP_ID}/${image}`}
                                            alt="Product Image"
                                            width={200}
                                            height={200}
                                            className="rounded-md object-cover"
                                        />
                                        <Button
                                            variant={'ghost'}
                                            size="icon"
                                            className="absolute top-2 right-2"
                                            onClick={() => {
                                                form.setValue(
                                                    'images',
                                                    form
                                                        .getValues('images')
                                                        .filter((i) => i !== image)
                                                )
                                            }}
                                        >
                                            <Trash2 className="size-4" />
                                        </Button>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    )}
                </FormItem>
                <FormField
                    control={form.control}
                    name="is_free"
                    render={({ field }) => (
                        <FormItem className="bg-background-secondary flex items-center justify-between rounded-md p-2">
                            <FormLabel>Is Free:</FormLabel>
                            <FormControl>
                                <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                {!form.watch('is_free') && (
                    <FormField
                        control={form.control}
                        name="price"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Price:</FormLabel>
                                <FormControl>
                                    <Input
                                        className="bg-secondary"
                                        type="number"
                                        placeholder="6.90"
                                        {...field}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                )}
                <FormItem>
                    <FormLabel>File:</FormLabel>
                    <UploadDropzone
                        endpoint={'productDownloadUploader'}
                        onUploadBegin={() => {
                            if (!currentFile) return

                            setCurrentFile(undefined)
                        }}
                        onClientUploadComplete={(res) => {
                            if (!res[0]) return

                            form.setValue('download', res[0].key)
                            setCurrentFile({
                                filename: res[0].name,
                                size: res[0].size,
                                ut_key: res[0].key
                            })
                        }}
                        onUploadError={(error) => {
                            toast.error('Oh Nyo! Something went wrong', {
                                description: error.message
                            })
                        }}
                    />
                    {currentFile && (
                        <Card>
                            <CardHeader>
                                <CardTitle>{currentFile.filename}</CardTitle>
                                <CardDescription>
                                    {format_file_size(currentFile.size)}
                                </CardDescription>
                            </CardHeader>
                        </Card>
                    )}
                </FormItem>
                <div className="flex w-full justify-between">
                    <Button variant="outline" asChild>
                        <Link href="/dashboard/artist-corner">Cancel</Link>
                    </Button>
                    <Button
                        type="submit"
                        disabled={
                            !form.formState.isValid ||
                            createProduct.isPending ||
                            createProduct.isSuccess
                        }
                    >
                        Create
                    </Button>
                </div>
            </form>
        </Form>
    )
}

export function UpdateForm(props: {
    product: NonNullable<RouterOutputs['artist_corner']['get_product_by_id']['product']>
}) {
    const [currentFile, setCurrentFile] = useState<DownloadData>(props.product.download)
    const router = useRouter()

    const form = useForm<ProductSchemaType>({
        resolver: zodResolver(productSchema),
        mode: 'onSubmit',
        defaultValues: {
            name: props.product.name,
            description: JSON.stringify(props.product.description),
            price: (props.product.price / 100).toFixed(2),
            images: props.product.images,
            download: props.product.download.ut_key,
            is_free: props.product.is_free
        }
    })

    const updateProduct = api.artist_corner.update_product.useMutation({
        onMutate: () => {
            const toast_id = toast.loading('Updating Product')

            return { toast_id }
        },
        onSuccess: (_, __, ctx) => {
            toast.success('Product Updated', {
                id: ctx.toast_id
            })

            router.push('/dashboard/artist-corner')
        },
        onError: (_, __, ctx) => {
            toast.error('Failed to create product', {
                id: ctx?.toast_id
            })
        }
    })

    const process_form = async (data: ProductSchemaType) => {
        updateProduct.mutate({
            ...data,
            id: props.product.id,
            download: currentFile,
            price: Number(data.price) * 100,
            description: JSON.stringify(data.description)
        })
    }

    return (
        <Form {...form}>
            <form
                className="flex flex-col gap-4"
                onSubmit={form.handleSubmit(process_form)}
            >
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Name:</FormLabel>
                            <FormControl>
                                <Input
                                    className="bg-secondary"
                                    placeholder="Product Name"
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
                                    onUpdate={field.onChange}
                                    content={props.product.description}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormItem>
                    <FormLabel>Images:</FormLabel>
                    <UploadDropzone
                        endpoint={'productImageUploader'}
                        onClientUploadComplete={(res) => {
                            form.setValue(
                                'images',
                                res.map((image) => image.key)
                            )
                        }}
                        onUploadError={(error) => {
                            toast.error('Oh Nyo! Something went wrong', {
                                description: error.message
                            })
                        }}
                    />
                    {form.watch('images').length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Preview</CardTitle>
                            </CardHeader>
                            <CardContent className="flex gap-2 overflow-x-auto">
                                {form.watch('images').map((image) => (
                                    <div className="relative" key={image}>
                                        <Image
                                            src={`https://utfs.io/a/${env.NEXT_PUBLIC_UPLOADTHING_APP_ID}/${image}`}
                                            alt="Product Image"
                                            width={200}
                                            height={200}
                                            className="rounded-md object-cover"
                                        />
                                        <Button
                                            variant={'ghost'}
                                            size="icon"
                                            className="absolute top-2 right-2"
                                            onClick={() => {
                                                form.setValue(
                                                    'images',
                                                    form
                                                        .getValues('images')
                                                        .filter((i) => i !== image)
                                                )
                                            }}
                                        >
                                            <Trash2 className="size-4" />
                                        </Button>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    )}
                </FormItem>
                <FormField
                    control={form.control}
                    name="is_free"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Is Free:</FormLabel>
                            <FormControl>
                                <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                {!form.watch('is_free') && (
                    <FormField
                        control={form.control}
                        name="price"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Price:</FormLabel>
                                <FormControl>
                                    <Input
                                        className="bg-secondary"
                                        type="number"
                                        placeholder="6.90"
                                        {...field}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                )}
                <FormItem>
                    <FormLabel>File:</FormLabel>
                    <UploadDropzone
                        endpoint={'productDownloadUploader'}
                        onClientUploadComplete={(res) => {
                            if (!res[0]) return

                            form.setValue('download', res[0].key)
                            setCurrentFile({
                                filename: res[0].name,
                                size: res[0].size,
                                ut_key: res[0].key
                            })
                        }}
                        onUploadError={(error) => {
                            toast.error('Oh Nyo! Something went wrong', {
                                description: error.message
                            })
                        }}
                    />
                    {currentFile && (
                        <Card>
                            <CardHeader>
                                <CardTitle>{currentFile.filename}</CardTitle>
                                <CardDescription>
                                    {format_file_size(currentFile.size ?? 0)}
                                </CardDescription>
                            </CardHeader>
                        </Card>
                    )}
                </FormItem>
                <div className="flex w-full justify-between">
                    <Button variant="outline" asChild>
                        <Link href={`/dashboard/artist-corner/${props.product.id}`}>
                            Cancel
                        </Link>
                    </Button>
                    <Button
                        type="submit"
                        disabled={updateProduct.isPending || updateProduct.isSuccess}
                    >
                        Update
                    </Button>
                </div>
            </form>
        </Form>
    )
}
