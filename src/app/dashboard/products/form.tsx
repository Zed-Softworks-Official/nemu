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

import { UploadDropzone } from '~/app/_components/uploadthing'
import { Button } from '~/app/_components/ui/button'
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from '~/app/_components/ui/form'
import { Input } from '~/app/_components/ui/input'

import { env } from '~/env'
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from '~/app/_components/ui/card'
import { Switch } from '~/app/_components/ui/switch'

import { formatFileSize } from '~/lib/utils'
import { type DownloadData } from '~/lib/types'

import { api, type RouterOutputs } from '~/trpc/react'
import { type JSONContent } from '@tiptap/react'

const MarkdownEditor = dynamic(
    () =>
        import('~/app/_components/ui/markdown-editor').then((mod) => mod.MarkdownEditor),
    {
        ssr: false
    }
)

const productSchema = z
    .object({
        title: z.string().min(2).max(64),
        description: z.any(),
        price: z.union([z.string(), z.number()]),
        images: z.array(z.string()).min(1).max(5),
        download: z.string().min(1),
        isFree: z.boolean()
    })
    .superRefine((data, ctx) => {
        const numericPrice =
            typeof data.price === 'string' ? Number.parseFloat(data.price) : data.price
        if (!data.isFree) {
            if (isNaN(numericPrice) || numericPrice <= 0 || numericPrice < 1) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: 'Price must be a number greater than 0',
                    path: ['price']
                })
            }
        } else {
            if (!(data.price === 0 || data.price === '0' || data.price === '')) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: 'Price must be 0 if product is free',
                    path: ['price']
                })
            }
        }
    })

type ProductSchemaType = z.infer<typeof productSchema>

type ProductFormProps = {
    mode: 'create' | 'update'
    initialData?: {
        id: string
        title: string
        description: JSONContent
        price: number
        images: string[]
        download: DownloadData
        isFree: boolean
    }
}

export function ProductForm({ mode, initialData }: ProductFormProps) {
    const [currentFile, setCurrentFile] = useState<DownloadData | undefined>(
        initialData?.download
    )
    const router = useRouter()

    const defaultValues =
        mode === 'create'
            ? {
                  title: '',
                  description: '',
                  price: '0',
                  images: [],
                  download: '',
                  isFree: false
              }
            : {
                  title: initialData?.title,
                  description: JSON.stringify(initialData?.description),
                  price: ((initialData?.price ?? 0) / 100).toFixed(2),
                  images: initialData?.images,
                  download: initialData?.download.utKey,
                  isFree: initialData?.isFree
              }

    const form = useForm<ProductSchemaType>({
        resolver: zodResolver(productSchema),
        mode: 'onSubmit',
        defaultValues
    })

    const createProduct = api.artistCorner.setProduct.useMutation({
        onMutate: () => {
            const toast_id = toast.loading('Creating Product')
            return { toast_id }
        },
        onSuccess: (_, __, ctx) => {
            toast.success('Product Created', {
                id: ctx.toast_id
            })
            router.push('/dashboard/products')
        },
        onError: (_, __, ctx) => {
            toast.error('Failed to create product', {
                id: ctx?.toast_id
            })
        }
    })

    const updateProduct = api.artistCorner.updateProduct.useMutation({
        onMutate: () => {
            const toast_id = toast.loading('Updating Product')
            return { toast_id }
        },
        onSuccess: (_, __, ctx) => {
            toast.success('Product Updated', {
                id: ctx.toast_id
            })
            router.push('/dashboard/products')
        },
        onError: (_, __, ctx) => {
            toast.error('Failed to update product', {
                id: ctx?.toast_id
            })
        }
    })

    const mutation = mode === 'create' ? createProduct : updateProduct

    const processForm = async (data: ProductSchemaType) => {
        if (!currentFile) {
            toast.error('Download File Invalid')
            return
        }

        const commonData = {
            ...data,
            price: Number(data.price) * 100,
            download: currentFile,
            description:
                mode === 'create'
                    ? (data.description as JSONContent)
                    : JSON.stringify(data.description)
        }

        if (mode === 'create') {
            createProduct.mutate(commonData)
        } else if (initialData) {
            updateProduct.mutate({
                ...commonData,
                id: initialData.id
            })
        }
    }

    const cancelHref =
        mode === 'create'
            ? '/dashboard/products'
            : `/dashboard/products/${initialData?.id}`

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
                                    content={
                                        mode === 'update'
                                            ? initialData?.description
                                            : undefined
                                    }
                                    placeholder="Write a description for your product"
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="images"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Images:</FormLabel>
                            <UploadDropzone
                                endpoint={'productImageUploader'}
                                onClientUploadComplete={(res) => {
                                    field.onChange(res.map((image) => image.key))
                                }}
                                onUploadError={(error) => {
                                    toast.error('Oh Nyo! Something went wrong', {
                                        description: error.message
                                    })
                                }}
                                className="ut-label:text-foreground ut-allowed-content:text-muted-foreground border-secondary border-2 border-dashed"
                            />
                            {field.value.length > 0 && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Preview</CardTitle>
                                    </CardHeader>
                                    <CardContent className="flex gap-2 overflow-x-auto">
                                        {field.value.map((image) => (
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
                                                        field.onChange(
                                                            field.value.filter(
                                                                (i) => i !== image
                                                            )
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
                    )}
                />

                <FormField
                    control={form.control}
                    name="isFree"
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
                {!form.watch('isFree') && (
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
                <FormField
                    control={form.control}
                    name="download"
                    render={({ field }) => (
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

                                    field.onChange(res[0].key)
                                    setCurrentFile({
                                        filename: res[0].name,
                                        size: res[0].size,
                                        utKey: res[0].key
                                    })
                                }}
                                onUploadError={(error) => {
                                    toast.error('Oh Nyo! Something went wrong', {
                                        description: error.message
                                    })
                                }}
                                className="ut-label:text-foreground ut-allowed-content:text-muted-foreground border-secondary border-2 border-dashed"
                            />
                            {currentFile && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle>{currentFile.filename}</CardTitle>
                                        <CardDescription>
                                            {formatFileSize(currentFile.size ?? 0)}
                                        </CardDescription>
                                    </CardHeader>
                                </Card>
                            )}
                        </FormItem>
                    )}
                />

                <div className="flex w-full justify-between">
                    <Button variant="outline" asChild>
                        <Link href={cancelHref}>Cancel</Link>
                    </Button>
                    <Button
                        type="submit"
                        disabled={
                            (mode === 'create' && !form.formState.isValid) ||
                            mutation.isPending ||
                            mutation.isSuccess
                        }
                    >
                        {mode === 'create' ? 'Create' : 'Update'}
                    </Button>
                </div>
            </form>
        </Form>
    )
}

export function CreateForm() {
    return <ProductForm mode="create" />
}

export function UpdateForm(props: {
    product: NonNullable<
        RouterOutputs['artistCorner']['getProductByIdDashboard']['product']
    >
}) {
    return (
        <ProductForm
            mode="update"
            initialData={{
                id: props.product.id,
                title: props.product.title,
                description: props.product.description!,
                price: props.product.price,
                images: props.product.images,
                download: props.product.download,
                isFree: props.product.isFree
            }}
        />
    )
}
