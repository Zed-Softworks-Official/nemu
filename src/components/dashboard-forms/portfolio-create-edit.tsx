'use client'

import Link from 'next/link'

import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { CheckCircle2Icon, CheckCircleIcon, XCircleIcon } from 'lucide-react'
import { zodResolver } from '@hookform/resolvers/zod'

import { Input } from '~/components/ui/input'
import { Button } from '~/components/ui/button'
import { Form, FormField, FormItem, FormLabel } from '~/components/ui/form'
import { api } from '~/trpc/react'
import { toast } from 'sonner'

import { useCallback, useEffect, useState } from 'react'
import { useUploadThing } from '~/components/uploadthing'
import { useDropzone } from '@uploadthing/react'
import { generateClientDropzoneAccept } from 'uploadthing/client'
import NemuImage from '~/components/nemu-image'

const portfolioSchema = z.object({
    name: z.string().min(2).max(50)
})

type PortfolioSchemaType = z.infer<typeof portfolioSchema>

export default function PortfolioCreateEditForm() {
    const [files, setFiles] = useState<File[]>([])
    const [filePreviews, setFilePreviews] = useState<string[]>([])

    const mutation = api.portfolio.set_portfolio_item.useMutation({
        onSuccess: () => {
            toast('Portfolio Item Created!', {
                icon: <CheckCircleIcon className="w-6 h-6 text-success" />
            })
        },
        onError: (e) => {
            toast('Error Creating Portfolio Item', {
                icon: <XCircleIcon className="w-6 h-6 text-error" />
            })
        }
    })

    const { startUpload, permittedFileInfo } = useUploadThing('portfolioUploader', {
        onClientUploadComplete: (res) => {
            if (!res[0]?.url) {
                return
            }

            mutation.mutate({
                image: res[0]?.url,
                name: form.getValues('name')
            })
        }
    })

    const onDrop = useCallback((acceptedFiles: File[]) => {
        setFiles(acceptedFiles)
        setFilePreviews(acceptedFiles.map((file) => URL.createObjectURL(file)))
    }, [])

    const form = useForm<PortfolioSchemaType>({
        resolver: zodResolver(portfolioSchema),
        mode: 'onSubmit'
    })

    const fileTypes = permittedFileInfo?.config
        ? Object.keys(permittedFileInfo?.config)
        : []

    const { getRootProps, getInputProps } = useDropzone({
        onDrop,
        accept: fileTypes ? generateClientDropzoneAccept(fileTypes) : undefined
    })

    useEffect(() => {
        return () => {
            for (const preview of filePreviews) {
                URL.revokeObjectURL(preview)
            }
        }
    }, [filePreviews])

    return (
        <Form {...form}>
            <form className="flex flex-col gap-5 max-w-xl mx-auto">
                <FormField
                    name="name"
                    control={form.control}
                    render={({ field }) => (
                        <FormItem className="form-control">
                            <FormLabel className="label">Name:</FormLabel>
                            <Input placeholder="Name" {...field} />
                        </FormItem>
                    )}
                />
                <div
                    {...getRootProps()}
                    className="mx-auto p-10 border-dashed border-base-content border-opacity-50 border-2 rounded-xl focus:border-primary bg-base-100 text-center border-spacing-28 w-full"
                >
                    <input {...getInputProps()} className="hidden" />
                    Drop files here!
                </div>
                {filePreviews.length !== 0 && (
                    <div className="card shadow-xl">
                        <figure>
                            <NemuImage
                                src={filePreviews[0]!}
                                alt="Preview"
                                width={200}
                                height={200}
                                className="w-full h-full rounded-xl"
                            />
                        </figure>
                    </div>
                )}
                <div className="flex justify-between">
                    <Link
                        href={'/dashboard/portfolio'}
                        className="btn btn-outline btn-error"
                    >
                        <XCircleIcon className="w-6 h-6" />
                        Cancel
                    </Link>
                    <Button
                        type="button"
                        onClick={async () => {
                            const valid = await form.trigger('name')
                            if (!valid) {
                                toast('Invalid name', {
                                    icon: <XCircleIcon className="w-6 h-6 text-error" />
                                })

                                return
                            }

                            startUpload(files)
                        }}
                    >
                        <CheckCircle2Icon className="w-6 h-6" />
                        Create Portfolio Item
                    </Button>
                </div>
            </form>
        </Form>
    )
}
