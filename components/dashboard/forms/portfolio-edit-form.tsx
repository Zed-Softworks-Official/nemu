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
import { CheckCircleIcon, TrashIcon, XCircleIcon } from '@heroicons/react/20/solid'

import { portfolioSchema, PortfolioSchemaType } from './portfolio-add-form'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import TextField from '@/components/form/text-input'
import NemuImage from '@/components/nemu-image'
import Loading from '@/components/loading'

export default function PortfolioEditForm() {
    const item_id = GetItemId(usePathname())

    const { push, replace } = useRouter()
    const { image } = useFormContext()
    const { artistId } = useDashboardContext()
    const { data, isLoading } = useSWR(
        `{
        portfolio_item(artist_id: "${artistId}", item_id: "${item_id}") {
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
        // const formData = new FormData(event.currentTarget)
        // if (image) {
        //     formData.set('dropzone-file', image!)
        // }
        // try {
        //     toast
        //         .promise(
        //             fetch(`/api/portfolio/${artistId}/item/${item_id}/update`, {
        //                 method: 'POST',
        //                 body: formData
        //             }),
        //             {
        //                 pending: 'Updating Portfolio Item',
        //                 success: 'Portfolio Item Updated',
        //                 error: 'Portfolio Item Failed to Update'
        //             },
        //             {
        //                 theme: 'dark'
        //             }
        //         )
        //         .then(() => {
        //             push('/dashboard/portfolio')
        //         })
        // } catch (error) {
        //     console.log(error)
        // }
    }

    // Object Deletion
    async function handleDeletion() {
        fetch(`/api/aws/${artistId}/portfolio/${item_id}/delete`).then((response) => {
            response.json().then((json_response) => {
                if ((json_response as NemuResponse).status != StatusCode.Success) {
                    toast('Unable to delete portfolio item from AWS ')
                }
            })
        })

        const deletion_response = await GraphQLFetcher(`mutation {
            delete_portfolio_item(artist_id:"${artistId}", image_key:"${item_id}") {
              status
            }
          }`)

        if (
            (deletion_response as { delete_portfolio_item: NemuResponse })
                .delete_portfolio_item.status != StatusCode.Success
        ) {
            toast('Unable to delete portfolio item from database')
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

                <FormDropzone label="Update Portfolio Item" />

                <div className="flex flex-row items-center justify-center gap-5">
                    <button type="submit" className="btn btn-primary">
                        <CheckCircleIcon className="w-6 h-6" />
                        Save Item
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
