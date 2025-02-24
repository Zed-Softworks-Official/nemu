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
import { format_file_size } from '~/lib/utils'
import { api } from '~/trpc/react'

const MarkdownEditor = dynamic(
    () => import('~/components/ui/markdown-editor').then((mod) => mod.MarkdownEditor),
    {
        ssr: false
    }
)

const createSchema = z.object({
    name: z.string().min(2).max(64),
    description: z.string().min(2).max(500),
    price: z
        .string()
        .refine((val) => !isNaN(Number(val)), {
            message: 'Price must be a number'
        })
        .refine((val) => Number(val) >= 0, {
            message: 'Price must be greater than 0'
        }),
    images: z.array(z.string()).min(1).max(5),
    download: z.string().min(1)
})

type CreateSchemaType = z.infer<typeof createSchema>

interface UploadedFile {
    filename: string
    size: number
    key: string
}

export function CreateForm() {
    const [currentFile, setCurrentFile] = useState<UploadedFile | undefined>()
    const router = useRouter()

    const form = useForm<CreateSchemaType>({
        resolver: zodResolver(createSchema),
        mode: 'onSubmit',
        defaultValues: {
            name: '',
            description: '',
            price: '',
            images: [],
            download: ''
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

    const process_form = async (data: CreateSchemaType) => {
        createProduct.mutate({
            ...data,
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
                                key: res[0].key
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
