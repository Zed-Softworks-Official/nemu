'use client'

import { FormEvent } from 'react'

import TextInput from '@/components/form/text-input'
import FileInput from '@/components/form/file-input'
import TextField from '@/components/form/text-field'
import FormDropzone from '@/components/form/form-dropzone'

import { useFormContext } from '@/components/form/form-context'
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/20/solid'
import { useRouter } from 'next/navigation'
import { toast } from 'react-toastify'
import { useDashboardContext } from '@/components/Navigation/Dashboard/dashboard-context'

export default function ShopAddForm() {
    const { stripe_id } = useDashboardContext()
    const { image } = useFormContext()
    const { replace, push } = useRouter()

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        const formData = new FormData(event.currentTarget)
        formData.set('featured_image', image!)

        toast.promise(
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
            <TextField label="Product Description" markdown="" name="product_description" />
            <TextInput
                label="Price"
                name="product_price"
                placeholder="Let's give the product a price!"
                type="number"
            />
            <FormDropzone label="Featured Store Image" name="featured_image" />
            <FileInput label="Additional Photos (8 Max)" name="product_images" multiple max_length={8}/>
            <FileInput label="Asset" name="download_file" />
            <div className="grid grid-cols-2 w-full gap-5">
                <button
                    type="button"
                    className="bg-error p-5 rounded-xl w-full mt-5 inline-block"
                    onClick={() => replace('/dashboard/shop')}
                >
                    <XCircleIcon className="w-6 h-6 inline-block mr-3" />
                    Cancel
                </button>
                <button
                    type="submit"
                    className="bg-gradient-to-r from-primarylight to-azure p-5 rounded-xl w-full mt-5 inline-block"
                >
                    <CheckCircleIcon className="w-6 h-6 inline-block mr-3" />
                    Add Product
                </button>
            </div>
        </form>
    )
}
