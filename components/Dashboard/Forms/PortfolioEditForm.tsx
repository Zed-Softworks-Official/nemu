'use client'

import useSWR from 'swr'
import Image from 'next/image'

import { FormEvent } from 'react'
import { toast } from 'react-toastify'

import TextInput from '@/components/Form/TextInput'
import { usePathname, useRouter } from 'next/navigation'
import FormDropzone from '@/components/Form/FormDropzone'
import { useFormContext } from '@/components/Form/FormContext'
import { useDashboardContext } from '@/components/Navigation/Dashboard/DashboardContext'
import { fetcher } from '@/helpers/fetcher'
import {
    CheckCircleIcon,
    FireIcon,
    XCircleIcon
} from '@heroicons/react/20/solid'

export default function PortfolioEditForm() {
    const { push, replace } = useRouter()
    const pathname = usePathname()
    let lastSlash = pathname.lastIndexOf('/')
    let item_id = pathname.substring(lastSlash + 1, pathname.length + 1)

    const { image } = useFormContext()
    const { handle } = useDashboardContext()
    const { data } = useSWR(
        `/api/artist/item/${handle}/portfolio/${item_id}`,
        fetcher
    )

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
                    fetch(
                        `/api/artist/item/${handle}/portfolio/${item_id}/update`,
                        {
                            method: 'POST',
                            body: formData
                        }
                    ),
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
                    fetch(
                        `/api/artist/item/${handle}/portfolio/${item_id}/delete`
                    ),
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
                    <TextInput
                        label="Title"
                        name="title"
                        placeholder={data?.item.name}
                    />

                    <div className="mb-5">
                        <label className="block mb-5">Current Image:</label>
                        <Image
                            src={data?.item.signed_url}
                            width={500}
                            height={500}
                            alt="Portfolio Item"
                            className="rounded-3xl"
                        />
                    </div>
                    <FormDropzone label="Update Portfolio Item" />
                </div>
            </div>
            <div className="flex flex-row items-center justify-center">
                <button
                    type="submit"
                    className="bg-primary p-5 rounded-3xl m-5"
                >
                    <CheckCircleIcon className="w-6 h-6 inline mr-3" />
                    Save Item
                </button>
                <button
                    type="button"
                    onClick={errorClick}
                    className="bg-error p-5 rounded-3xl m-5"
                >
                    <XCircleIcon className="w-6 h-6 inline mr-3" />
                    Cancel
                </button>
            </div>
            <div className="flex flex-row items-center justify-center">
                <button
                    type="button"
                    onClick={handleDeletion}
                    className=" bg-gradient-to-r from-error to-error/80 p-5 rounded-3xl m-5"
                >
                    <FireIcon className="w-6 h-6 inline mr-3" />
                    Delete Item
                </button>
            </div>
        </form>
    )
}
