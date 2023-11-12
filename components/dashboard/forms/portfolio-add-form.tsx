'use client'

import { toast } from 'react-toastify'
import { useRouter } from 'next/navigation'
import React, { FormEvent, useState } from 'react'

import TextInput from '@/components/form/text-input'
import FormDropzone from '@/components/form/form-dropzone'
import { CheckCircleIcon } from '@heroicons/react/20/solid'
import { useFormContext } from '@/components/form/form-context'
import { useDashboardContext } from '@/components/Navigation/Dashboard/dashboard-context'

export default function PortfolioAddForm() {
    const { image } = useFormContext()

    const [isLoading, setIsLoading] = useState(false)
    const { handle } = useDashboardContext()
    const { push } = useRouter()

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        setIsLoading(true)

        try {
            const formData = new FormData(event.currentTarget)
            if (!image) {
                toast.error('Error: Portfolio Item Incomplete', {
                    theme: 'dark'
                })
                setIsLoading(false)
                return
            }

            formData.set('dropzone-file', image)

            let filename = crypto.randomUUID()

            toast
                .promise(
                    fetch(`/api/artist/item/${handle}/portfolio/${filename}`, {
                        method: 'POST',
                        body: formData
                    }),
                    {
                        pending: 'Uploading Image',
                        success: 'Upload Successful',
                        error: 'Upload Failed'
                    },
                    {
                        theme: 'dark'
                    }
                )
                .then(() => {
                    setIsLoading(false)

                    push('/dashboard/portfolio')
                })
        } catch (error) {
            console.log(error)
        }
    }

    return (
        <form
            className="max-w-lg mx-auto"
            onSubmit={handleSubmit}
            encType="multipart/form-data"
        >
            <TextInput label="Title" name="title" />
            <FormDropzone label="Your beautiful artwork here:" />
            <div className="flex flex-row items-center justify-center my-5">
                <button
                    type="submit"
                    className="bg-primary p-5 rounded-3xl m-5"
                    disabled={isLoading}
                >
                    <CheckCircleIcon className="w-6 h-6 inline mr-3" />
                    Create Item
                </button>
            </div>
        </form>
    )
}
