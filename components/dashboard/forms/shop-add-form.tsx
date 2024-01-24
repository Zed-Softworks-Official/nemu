'use client'

import { FormEvent } from 'react'

import TextInput from '@/components/form/text-input'
import FileInput from '@/components/form/file-input'
import MarkdownTextArea from '@/components/form/markdown-text-area'
import FormDropzone from '@/components/form/form-dropzone'

import { useFormContext } from '@/components/form/form-context'
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/20/solid'
import { useRouter } from 'next/navigation'
import { toast } from 'react-toastify'
import { useDashboardContext } from '@/components/navigation/dashboard/dashboard-context'

export default function ShopAddForm() {
    const { stripe_id } = useDashboardContext()
    const { image } = useFormContext()
    const { replace, push } = useRouter()

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        const formData = new FormData(event.currentTarget)
        formData.set('featured_image', image!)

        toast
            .promise(
                fetch(`/api/stripe/${stripe_id}/product`, {
                    method: 'post',
                    body: formData
                }),
                {
                    pending: "Adding to Artist's Corner",
                    success: 'Successfully Added',
                    error: "Failed to add item to Artist's Corner"
                },
                {
                    theme: 'dark'
                }
            )
            .then(() => {
                push('/dashboard/shop')
            })
    }

    return (
        <form
            className="max-w-lg mx-auto"
            onSubmit={handleSubmit}
            encType="multipart/form-data"
        >
            <TextInput
                label="Product Name"
                placeholder="Your product name here!"
                name="product_name"
            />
            <MarkdownTextArea
                label="Product Description"
                markdown=""
                name="product_description"
            />
            <TextInput
                label="Price"
                name="product_price"
                placeholder="Let's give the product a price!"
                type="number"
            />
            <FormDropzone label="Featured Store Image" name="featured_image" />
            <FileInput
                label="Additional Photos (8 Max)"
                name="product_images"
                multiple
                max_length={8}
            />
            <FileInput label="Asset" name="download_file" />
            <div className="grid grid-cols-2 w-full gap-5">
                <button
                    type="button"
                    className="btn btn-error"
                    onClick={() => replace('/dashboard/shop')}
                >
                    <XCircleIcon className="w-6 h-6 inline-block mr-3" />
                    Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                    <CheckCircleIcon className="w-6 h-6 inline-block mr-3" />
                    Add Product
                </button>
            </div>
        </form>
    )
}
