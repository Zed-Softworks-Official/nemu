'use client'

import useSWR from 'swr'

import { FormEvent } from 'react'
import { toast } from 'react-toastify'
import { GetItemId, GraphQLFetcher } from '@/core/helpers'

import { usePathname, useRouter } from 'next/navigation'
import FormDropzone from '@/components/form/form-dropzone'
import { useFormContext } from '@/components/form/form-context'
import { NemuResponse, PortfolioResponse, StatusCode } from '@/core/responses'

import { useDashboardContext } from '@/components/navigation/dashboard/dashboard-context'
import { CheckCircleIcon, TrashIcon } from '@heroicons/react/20/solid'

import * as z from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import TextField from '@/components/form/text-input'
import NemuImage from '@/components/nemu-image'
import Loading from '@/components/loading'
import FileField from '@/components/form/file-input'

const portfolioSchema = z.object({
    name: z.string().min(2).max(50).optional(),
    file: z.any(z.instanceof(File)).optional()
})

type PortfolioSchemaType = z.infer<typeof portfolioSchema>

export default function PortfolioEditForm() {
    const image_id = GetItemId(usePathname())

    const { push, replace } = useRouter()
    const { image } = useFormContext()
    const { artistId } = useDashboardContext()
    const { data, isLoading } = useSWR(
        `{
        portfolio_item(artist_id: "${artistId}", item_id: "${image_id}") {
          name
          signed_url
        }
      }`,
        GraphQLFetcher
    )

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

        // Generate Key
        if (values.file.length != 0) {
            const new_image_key = crypto.randomUUID()

            formData.append('new_image_key', new_image_key)
            formData.append('file', values.file[0])

            updated_values += `, new_image_key: "${new_image_key}"`

            fetch(`/api/aws/${artistId}/portfolio/${image_id}/update`, {
                method: 'post',
                body: formData
            }).then((response) => {
                response.json().then((json_data) => {
                    if ((json_data as NemuResponse).status != StatusCode.Success) {
                        toast.update(toast_uploading, {
                            render: 'Error uploading file',
                            type: 'error',
                            autoClose: 5000,
                            isLoading: false
                        })

                        // TODO: Destroy Database item if created
                    }
                })
            })
        }

        const response = await GraphQLFetcher(`mutation {
            update_portfolio_item(artist_id: "${artistId}", image_key: "${image_id}" ${updated_values}) {
              status
            }
          }`)

        toast.update(toast_uploading, {
            render: 'Item Updated',
            type: 'success',
            autoClose: 5000,
            isLoading: false
        })

        push('/dashboard/portfolio')
    }

    // Object Deletion
    async function handleDeletion() {
        fetch(`/api/aws/${artistId}/portfolio/${image_id}/delete`).then((response) => {
            response.json().then((json_response) => {
                if ((json_response as NemuResponse).status != StatusCode.Success) {
                    toast('Unable to delete portfolio item from AWS ')
                }
            })
        })

        const deletion_response = await GraphQLFetcher(`mutation {
            delete_portfolio_item(artist_id:"${artistId}", image_key:"${image_id}") {
              status
            }
          }`)

        if (
            (deletion_response as { delete_portfolio_item: NemuResponse })
                .delete_portfolio_item.status != StatusCode.Success
        ) {
            toast('Unable to delete portfolio item from database', { theme: 'dark' })
        }

        push('/dashboard/portfolio')
    }

    return (
        <div className="max-w-xl mx-auto">
            <form
                className="flex flex-col gap-5"
                onSubmit={form.handleSubmit(EditPortfolioItem)}
            >
                <TextField
                    label="Title"
                    placeholder={(data as PortfolioResponse).portfolio_item?.name}
                    defaultValue={(data as PortfolioResponse).portfolio_item?.name}
                    {...form.register('name')}
                />

                <div className="card bg-base-100 shadow-xl">
                    <div className="card-body">
                        <label className="label font-bold">Current Image</label>
                        <div className="divider"></div>
                        <NemuImage
                            src={(data as PortfolioResponse).portfolio_item?.signed_url!}
                            width={500}
                            height={500}
                            alt="Portfolio Item"
                            className="rounded-3xl"
                        />
                    </div>
                </div>
                <FileField label="Artwork" multiple={false} {...form.register('file')} />

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
                        <TrashIcon className="w-6 h-6" />
                        Delete Item
                    </button>
                </div>
            </form>
        </div>
    )
}
