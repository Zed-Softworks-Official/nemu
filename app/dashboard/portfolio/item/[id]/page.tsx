'use client'

import useSWR from 'swr'
import { fetcher } from '@/helpers/fetcher'

import { useDashboardContext } from '@/components/Navigation/Dashboard/DashboardContext'
import { useDropzone } from 'react-dropzone'
import { usePathname, useRouter } from 'next/navigation'
import { FormEvent, useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import {
    CheckCircleIcon,
    FireIcon,
    XCircleIcon
} from '@heroicons/react/20/solid'
import DashboardContainer from '@/components/Dashboard/DashboardContainer'
import TextInput from '@/components/Form/TextInput'

export default function PortfolioItem() {
    const { push, replace } = useRouter()
    const pathname = usePathname()
    let lastSlash = pathname.lastIndexOf('/')
    let item_id = pathname.substring(lastSlash + 1, pathname.length + 1)

    const { handle } = useDashboardContext()
    const { data } = useSWR(
        `/api/artist/item/${handle}/portfolio/${item_id}`,
        fetcher
    )

    const [filePreview, setfilePreview] = useState('')
    const { acceptedFiles, getRootProps, getInputProps } = useDropzone({
        maxFiles: 1,
        accept: {
            'image/*': []
        },
        onDrop: (acceptedFiles) => {
            setfilePreview(URL.createObjectURL(acceptedFiles[0]))
        }
    })

    const thumbs = (
        <div className="inline-flex border-2 border-solid border-white mb-8 mr-8 w-full h-full box-border">
            <div className="flex min-w-0 overflow-hidden">
                <img className="block w-auto h-full" src={filePreview} />
            </div>
        </div>
    )

    useEffect(() => {
        return () => URL.revokeObjectURL(filePreview)
    }, [])

    // Form Cancellation
    const errorClick = () => {
        toast('Action Canceled!', { type: 'error', theme: 'dark' })

        replace('/dashboard/portfolio')
    }

    // Form Submit
    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        const formData = new FormData(event.currentTarget)
        formData.set('dropzone-file', acceptedFiles[0])

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
        <DashboardContainer title={`Edit ${data?.item.name}`}>
            <form
                    className="max-w-lg mx-auto"
                    encType="multipart/form-data"
                    onSubmit={handleSubmit}
                >
                    <div className="flex flex-wrap">
                        <div className="mx-auto">
                            <TextInput label="Title" name="title" placeholder={data?.item.name} />
                            
                            <div className="mb-5">
                                <label className="block mb-5">
                                    Current Image:{' '}
                                </label>
                                <img
                                    src={data?.item.signed_url}
                                    className="rounded-3xl"
                                />
                            </div>
                            <div className="mb-5">
                                <label className="block mb-5">
                                    Upload New Image:
                                </label>
                                <div
                                    className="mx-auto p-10 border-dashed border-white border-opacity-50 border-4 focus:border-primary bg-charcoal text-center border-spacing-28"
                                    {...getRootProps()}
                                >
                                    <input
                                        name="dropzone-file"
                                        type="file"
                                        {...getInputProps()}
                                    />
                                    <p>Drag a file to upload!</p>
                                </div>

                                <aside className="flex flex-col flex-wrap mt-16">
                                    <label className="block mb-5">
                                        Preview:{' '}
                                    </label>
                                    {thumbs}
                                </aside>
                            </div>
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
        </DashboardContainer>
    )
}
