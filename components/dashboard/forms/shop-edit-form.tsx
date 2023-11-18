'use client'

import useSWR from 'swr'
import Image from 'next/image'

import { usePathname, useRouter } from 'next/navigation'

import TextField from '@/components/form/text-field'
import TextInput from '@/components/form/text-input'
import FileInput from '@/components/form/file-input'
import FormDropzone from '@/components/form/form-dropzone'

import { FormEvent } from 'react'
import ShopEditCard from '../shop/shop-edit-card'
import { fetcher, get_item_id } from '@/helpers/fetcher'
import { CreateToastPromise } from '@/helpers/toast-promise'
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/20/solid'

export default function ShopEditForm() {
    const item_id = get_item_id(usePathname())

    const { replace } = useRouter()
    const { data } = useSWR(`/api/stripe/${item_id}/product`, fetcher)

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()

        CreateToastPromise(
            fetch(`/api/stripe/${item_id}/product/update`, {
                method: 'post',
                body: new FormData(event.currentTarget)
            }),
            { pending: 'Updating Shop Item!', success: 'Shop Item Updated!' }
        ).then(() => {
            replace('/dashboard/shop')
        })
    }

    return (
        <form
            className="max-w-6xl grid grid-cols-6 gap-4 mx-auto"
            onSubmit={handleSubmit}
            encType="multipart/form-data"
        >
            <div className="mb-5 col-span-2">
                <label className="block mb-5">Current Featured Image:</label>
                <Image
                    src={data?.product.featured_image}
                    width={500}
                    height={500}
                    alt="Product Image"
                    className="rounded-3xl mx-auto pb-5"
                />
                <FormDropzone label="Featured Store Image" name="featured_image" />
            </div>
            <div className="col-span-4">
                <TextInput
                    label="Product Name"
                    placeholder={data?.product.name}
                    name="product_name"
                    defaultValue={data?.product.name}
                />
                <TextField
                    label="Product Description"
                    markdown={data ? data?.product.description : ''}
                    name="product_description"
                />
                <TextInput
                    label="Price"
                    name="product_price"
                    placeholder={data?.product.price}
                    type="number"
                    defaultValue={data?.product.price}
                />
            </div>
            <div className="col-span-6">
                <FileInput
                    label="Add More Photos (8 Max)"
                    name="product_images"
                    multiple
                    max_length={8}
                />
                <label className="block mb-5">Current Images</label>
                <div className="grid grid-6 grid-flow-col gap-5 mb-5">
                    {data?.product.images.map((image: string, count: number) => (
                        <div key={count}>
                            <ShopEditCard
                                image_src={image}
                                alt_text={count.toString()}
                                index={count}
                            />
                        </div>
                    ))}
                </div>
                <FileInput label="Asset" name="download_file" />
            </div>
            <div className="grid grid-cols-2 w-full gap-5 col-span-6">
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
                    Save Changes
                </button>
            </div>
        </form>
    )
}
