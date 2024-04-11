'use client'

import { toast } from 'react-toastify'
import { GetItemId } from '@/core/helpers'

import { usePathname, useRouter } from 'next/navigation'
import FormDropzone from '@/components/form/form-dropzone'
import { useFormContext } from '@/components/form/form-context'

import { useDashboardContext } from '@/components/navigation/dashboard/dashboard-context'

import * as z from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import TextField from '@/components/form/text-input'
import NemuImage from '@/components/nemu-image'
import Loading from '@/components/loading'
import { api } from '@/core/api/react'
import { CheckCircleIcon, Trash2Icon } from 'lucide-react'

const portfolioSchema = z.object({
    name: z.string().min(2).max(50).optional(),
    file: z.any(z.instanceof(File)).optional()
})

type PortfolioSchemaType = z.infer<typeof portfolioSchema>

export default function PortfolioEditForm() {
    const image_id = GetItemId(usePathname())

    const { push, replace } = useRouter()
    const { image } = useFormContext()
    const { artist } = useDashboardContext()!
    const { data, isLoading } = api.portfolio.get_portfolio_item.useQuery({
        artist_id: artist?.id!,
        item_id: image_id
    })
    const update_mutation = api.portfolio.update_portfolio_item.useMutation()
    const del_mutation = api.portfolio.del_portfolio_item.useMutation()

    const form = useForm<PortfolioSchemaType>({
        resolver: zodResolver(portfolioSchema),
        mode: 'onSubmit'
    })

    // Form Cancellation
    const errorClick = () => {
        replace('/dashboard/portfolio')
    }

    if (isLoading) {
        return <Loading />
    }

    // Form Submit
    async function EditPortfolioItem(values: PortfolioSchemaType) {
        const formData = new FormData()

        const toast_uploading = toast.loading('Updating Portfolio Item', {
            theme: 'dark'
        })

        let updated_values: string = ``

        if (values.name) {
            updated_values += `, name: "${values.name}"`
        }

        let new_image_key = undefined
        // Generate Key
        if (values.file) {
            new_image_key = crypto.randomUUID()

            formData.append('new_image_key', new_image_key)
            formData.append('file', image as any)

            updated_values += `, new_image_key: "${new_image_key}"`

            const aws_response = await fetch(
                `/api/aws/${artist?.id}/portfolio/${image_id}/update`,
                {
                    method: 'post',
                    body: formData
                }
            )
            const aws_json = await aws_response.json()

            if ((aws_json as NemuResponse).status != StatusCode.Success) {
                toast.update(toast_uploading, {
                    render: 'Error uploading file',
                    type: 'error',
                    autoClose: 5000,
                    isLoading: false
                })
            }
        }

        update_mutation
            .mutateAsync({
                artist_id: artist?.id!,
                image_key: image_id,
                name: values.name || undefined,
                new_image_key: new_image_key
            })
            .then((response) => {
                if (!response.success) {
                    toast.update(toast_uploading, {
                        render: 'Error saving to database',
                        type: 'error',
                        autoClose: 5000,
                        isLoading: false
                    })

                    return
                }

                toast.update(toast_uploading, {
                    render: 'Item Updated',
                    type: 'success',
                    autoClose: 5000,
                    isLoading: false
                })

                push('/dashboard/portfolio')
            })
    }

    // Object Deletion
    async function handleDeletion() {
        const toast_deleting = toast.loading('Deleting Portfolio Item', {
            theme: 'dark'
        })

        fetch(`/api/aws/${artist?.id}/portfolio/${image_id}/delete`).then((response) => {
            response.json().then((json_response) => {
                if ((json_response as NemuResponse).status != StatusCode.Success) {
                    toast('Unable to delete portfolio item from AWS ')
                }
            })
        })

        del_mutation
            .mutateAsync({
                artist_id: artist?.id!,
                image_key: image_id
            })
            .then((response) => {
                if (!response.success) {
                    toast.update(toast_deleting, {
                        render: 'Error deleting from database',
                        type: 'error',
                        autoClose: 5000,
                        isLoading: false
                    })

                    return
                }

                toast.update(toast_deleting, {
                    render: 'Portfolio Item Deleted',
                    type: 'success',
                    autoClose: 5000,
                    isLoading: false
                })

                push('/dashboard/portfolio')
            })
    }

    if (isLoading) {
        return <Loading />
    }

    return (
        <div className="max-w-xl mx-auto">
            <form
                className="flex flex-col gap-5"
                onSubmit={form.handleSubmit(EditPortfolioItem)}
            >
                <TextField
                    label="Title"
                    placeholder={data?.name}
                    defaultValue={data?.name}
                    {...form.register('name')}
                />

                <div className="card bg-base-100 shadow-xl">
                    <div className="card-body">
                        <label className="label font-bold">Current Image</label>
                        <div className="divider"></div>
                        <NemuImage
                            src={data?.signed_url!}
                            width={500}
                            height={500}
                            alt="Portfolio Item"
                            className="rounded-3xl"
                        />
                    </div>
                </div>
                <FormDropzone label="Artwork" {...form.register('file')} />

                <div className="flex flex-row items-center justify-center gap-5">
                    <button type="submit" className="btn btn-primary">
                        <CheckCircleIcon className="w-6 h-6" />
                        Update Item
                    </button>
                    <button
                        type="button"
                        onClick={handleDeletion}
                        className="btn btn-error"
                    >
                        <Trash2Icon className="w-6 h-6" />
                        Delete Item
                    </button>
                </div>
            </form>
        </div>
    )
}
