'use client'

import useSWR from 'swr'
import Image from 'next/image'

import { FormEvent } from 'react'
import { toast } from 'react-toastify'
import { fetcher, get_item_id } from '@/core/helpers'

import TextInput from '@/components/form/text-input'
import { usePathname, useRouter } from 'next/navigation'
import FormDropzone from '@/components/form/form-dropzone'
import { useFormContext } from '@/components/form/form-context'
import { PortfolioResponse } from '@/core/responses'

import { useDashboardContext } from '@/components/navigation/dashboard/dashboard-context'
import { CheckCircleIcon, TrashIcon, XCircleIcon } from '@heroicons/react/20/solid'

export default function PortfolioEditForm() {
    const item_id = get_item_id(usePathname())

    const { push, replace } = useRouter()
    const { image } = useFormContext()
    const { handle } = useDashboardContext()
    const { data } = useSWR<PortfolioResponse>(`/api/portfolio/${handle}/item/${item_id}`, fetcher)

    // Form Cancellation
    const errorClick = () => {
        toast('Action Canceled!', { type: 'error', theme: 'dark' })

        replace('/dashboard/portfolio')
    }

    // Form Submit
    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        const formData = new FormData(event.currentTarget)
        if (image) {
            formData.set('dropzone-file', image!)
        }

        try {
            toast
                .promise(
                    fetch(`/api/portfolio/${handle}/item/${item_id}/update`, {
                        method: 'POST',
                        body: formData
                    }),
                    {
                        pending: 'Updating Portfolio Item',
                        success: 'Portfolio Item Updated',
                        error: 'Portfolio Item Failed to Update'
                    },
                    {
                        theme: 'dark'
                    }
                )
                .then(() => {
                    push('/dashboard/portfolio')
                })
        } catch (error) {
            console.log(error)
        }
    }

    // Object Deletion
    async function handleDeletion() {
        try {
            toast
                .promise(
                    fetch(`/api/portfolio/${handle}/item/${item_id}/delete`),
                    {
                        pending: 'Deleting Portfolio Item',
                        success: 'Portfolio Item Deleted',
                        error: 'Failed To Delete Portfolio Item'
                    },
                    {
                        theme: 'dark'
                    }
                )
                .then(() => {
                    push('/dashboard/portfolio')
                })
        } catch (error) {
            console.log(error)
        }
    }

    return (
        <form
            className="max-w-lg mx-auto"
            encType="multipart/form-data"
            onSubmit={handleSubmit}
        >
            <div className="flex flex-wrap">
                <div className="mx-auto">
                    <TextInput label="Title" name="title" placeholder={data?.item?.name} />

                    <div className="mb-5">
                        <label className="block mb-5">Current Image:</label>
                        <Image
                            src={data?.item?.signed_url!}
                            width={500}
                            height={500}
                            alt="Portfolio Item"
                            className="rounded-3xl"
                        />
                    </div>
                    <FormDropzone label="Update Portfolio Item" />
                </div>
            </div>
            <div className="flex flex-row items-center justify-center gap-5">
                <button type="submit" className="btn btn-primary btn-lg">
                    <CheckCircleIcon className="w-6 h-6 inline mr-3" />
                    Save Item
                </button>
                <button
                    type="button"
                    onClick={errorClick}
                    className="btn btn-error btn-lg"
                >
                    <XCircleIcon className="w-6 h-6 inline mr-3" />
                    Cancel
                </button>
            </div>
            <div className="flex flex-row items-center justify-center mt-5">
                <button
                    type="button"
                    onClick={handleDeletion}
                    className="btn btn-error btn-lg"
                >
                    <TrashIcon className="w-6 h-6 inline mr-3" />
                    Delete Item
                </button>
            </div>
        </form>
    )
}
