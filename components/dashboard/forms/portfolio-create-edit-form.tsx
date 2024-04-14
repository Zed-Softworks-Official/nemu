'use client'

import TextField from '@/components/form/text-input'
import NemuImage from '@/components/nemu-image'
import { useUploadContext } from '@/components/upload/upload-context'
import UploadDropzone from '@/components/upload/upload-dropzone'
import { api } from '@/core/api/react'
import { AWSEndpoint, AWSMimeType } from '@/core/structures'
import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle2Icon, CheckCircleIcon, XCircleIcon } from 'lucide-react'
import { User } from 'next-auth'
import Link from 'next/link'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Id, toast } from 'react-toastify'
import * as z from 'zod'

const portfolioSchema = z.object({
    name: z.string().min(2).max(50)
})

type PortfolioSchemaType = z.infer<typeof portfolioSchema>

export default function PortfolioCreateEditForm({ user }: { user: User }) {
    const mutation = api.portfolio.set_portfolio_item.useMutation({
        onSuccess: () => {
            if (!toastId) return

            toast.update(toastId, {
                render: 'Portfolio Item Created!',
                isLoading: false,
                type: 'error',
                autoClose: 5000
            })
        }
    })

    const [toastId, setToastId] = useState<Id | undefined>()
    const { files, filePreviews, upload, uploadMutation } = useUploadContext()!
    const { handleSubmit, register, getValues } = useForm<PortfolioSchemaType>({
        resolver: zodResolver(portfolioSchema),
        mode: 'onSubmit'
    })

    function ProcessForm(values: PortfolioSchemaType) {
        // TODO: Notify User
        if (files?.length === 0) {
            return
        }

        setToastId(
            toast.loading('Creating portfolio item', {
                theme: 'dark'
            })
        )

        upload()
    }

    return (
        <div className="max-w-xl mx-auto">
            <form className="flex flex-col gap-5" onSubmit={handleSubmit(ProcessForm)}>
                <TextField label="Title" placeholder="Title" {...register('name')} />
                <div className="form-control">
                    <label className="label">Artwork:</label>
                    <UploadDropzone
                        uploaded_by={user.artist_id!}
                        endpoint={AWSEndpoint.Portfolio}
                        accept={[AWSMimeType.Image]}
                        on_success={(res) => {
                            // Update db
                            mutation.mutate({
                                artist_id: user.artist_id!,
                                iamge_key: res.keys[0],
                                name: getValues('name')
                            })
                        }}
                        on_error={(e) => {
                            if (!toastId) return

                            toast.update(toastId, {
                                render: e.message,
                                isLoading: false,
                                type: 'error',
                                autoClose: 5000
                            })
                        }}
                    />
                </div>
                {filePreviews &&
                    filePreviews.map((preview, i) => (
                        <div key={i} className="card bg-base-100 shadow-xl">
                            <figure>
                                <NemuImage
                                    src={preview}
                                    width={200}
                                    height={200}
                                    alt="Preview Image"
                                    className="w-full rounded-xl"
                                />
                            </figure>
                        </div>
                    ))}
                <div className="divider"></div>
                <div className="flex justify-between">
                    <Link
                        href={'/dashboard/portfolio'}
                        className="btn btn-outline btn-error btn-wide"
                    >
                        <XCircleIcon className="w-6 h-6" />
                        Cancel
                    </Link>
                    <button
                        type="submit"
                        className="btn btn-primary btn-wide"
                        disabled={uploadMutation.isPending}
                    >
                        <CheckCircle2Icon className="w-6 h-6" />
                        Create Portfolio Item
                    </button>
                </div>
            </form>
        </div>
    )
}
