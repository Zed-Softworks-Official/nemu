'use client'

import { FormEvent } from 'react'

import TextInput from '@/components/Form/TextInput'
import FileInput from '@/components/Form/FileInput'
import TextField from '@/components/Form/TextField'
import FormDropzone from '@/components/Form/FormDropzone'

import { useFormContext } from '@/components/Form/FormContext'
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/20/solid'
import { useRouter } from 'next/navigation'

export default function ShopAddForm() {
    const { image } = useFormContext()
    const { replace, push } = useRouter()

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
    }

    return (
        <form className="max-w-lg mx-auto" onSubmit={handleSubmit}>
            <TextInput
                label="Product Name"
                placeholder="Your product name here!"
                name="product_name"
            />
            <TextField label="Product Description" markdown="" />
            <TextInput
                label="Price"
                name="product_price"
                placeholder="Let's give the product a price!"
                type="number"
            />
            <FormDropzone label="Featured Store Image" />
            <FileInput
                label="Additional Photos"
                name="product_images"
                multiple
            />
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
