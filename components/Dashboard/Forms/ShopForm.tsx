'use client'

import FileInput from '@/components/Form/FileInput'
import { useFormContext } from '@/components/Form/FormContext'
import FormDropzone from '@/components/Form/FormDropzone'
import TextField from '@/components/Form/TextField'
import TextInput from '@/components/Form/TextInput'
import { FormEvent } from 'react'

export default function ShopForm() {
    const {image} = useFormContext()

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
            <TextField label="Product Description" markdown='' />
            <TextInput
                label="Price"
                name="product_price"
                placeholder="Let's give the product a price!"
                type="number"
            />
            <FormDropzone label="Featured Store Image" />
            <FileInput label="Additional Photos" name="product_images" />
            <FileInput label="Asset" name="download_file" />
            <button
                type="submit"
                className="bg-gradient-to-r from-primarylight to-azure p-5 rounded-xl w-full mt-5"
            >
                Add Product
            </button>
        </form>
    )
}
