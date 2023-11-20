'use client'

import useSWR from 'swr'
import Link from 'next/link'
import Image from 'next/image'
import { FormEvent, useRef } from 'react'
import Loading from '@/components/loading'

import { usePathname, useRouter } from 'next/navigation'

import ShopEditCard from '../shop/shop-edit-card'
import TextField from '@/components/form/text-field'
import TextInput from '@/components/form/text-input'
import FileInput from '@/components/form/file-input'
import FormDropzone from '@/components/form/form-dropzone'

import { MDXEditorMethods } from '@mdxeditor/editor'
import { fetcher, get_item_id } from '@/helpers/fetcher'
import { CreateToastPromise } from '@/helpers/toast-promise'
import { ShopResponse } from '@/helpers/api/request-inerfaces'
import {
    ArrowDownOnSquareIcon,
    CheckCircleIcon,
    TrashIcon,
    XCircleIcon
} from '@heroicons/react/20/solid'
import Button, { ButtonStyle } from '@/components/button'
import { useFormContext } from '@/components/form/form-context'

export default function ShopEditForm() {
    const item_id = get_item_id(usePathname())
    const { image } = useFormContext()
    const description_ref = useRef<MDXEditorMethods>(null)
    let set = false

    const { replace } = useRouter()
    const { data, isLoading } = useSWR<ShopResponse>(
        `/api/stripe/${item_id}/product`,
        fetcher
    )

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        const formData = new FormData(event.currentTarget)
        if (image) {
            formData.set('featured_image', image!)
        }

        CreateToastPromise(
            fetch(`/api/stripe/${item_id}/product/update`, {
                method: 'post',
                body: formData
            }),
            { pending: 'Updating Shop Item!', success: 'Shop Item Updated!' }
        ).then(() => {
            replace('/dashboard/shop')
        })
    }

    if (isLoading) {
        return <Loading />
    } else if (!isLoading && !set) {
        description_ref.current?.setMarkdown(
            data?.product?.description! ? data?.product?.description! : ''
        )
        set = true
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
                    src={data?.product?.featured_image!}
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
                    placeholder={data?.product?.name}
                    name="product_name"
                    defaultValue={data?.product?.name}
                />
                <TextField
                    label="Product Description"
                    markdown={''}
                    editorRef={description_ref}
                    name="product_description"
                />
                <TextInput
                    label="Price"
                    name="product_price"
                    placeholder={data?.product?.price.toString()}
                    type="number"
                    defaultValue={data?.product?.price.toString()}
                />
            </div>
            <div className="col-span-6">
                <FileInput
                    label="Add More Photos (8 Max)"
                    name="product_images"
                    multiple
                    max_length={
                        data?.product?.images?.length != 0
                            ? 8 - data?.product?.images?.length!
                            : 8
                    }
                />
                {data?.product?.images?.length != 0 && (
                    <>
                        <label className="block mb-5">
                            Current Images ({data?.product?.images?.length} images)
                        </label>
                        <div className="grid grid-6 grid-flow-col gap-5 mb-5">
                            {data?.product?.images?.map(
                                (image: string, count: number) => (
                                    <div key={count}>
                                        <ShopEditCard
                                            image_src={image}
                                            alt_text={count.toString()}
                                            index={count}
                                        />
                                    </div>
                                )
                            )}
                        </div>
                    </>
                )}
            </div>
            <div className="col-span-6">
                <FileInput label="Update Asset" name="download_file" />
                <Button
                    label="Download Current Asset"
                    icon={
                        <ArrowDownOnSquareIcon className="w-6 h-6 mr-3 inline-block align-bottom" />
                    }
                    href={data?.product?.asset!}
                />
            </div>
            <div className="grid grid-cols-3 w-full gap-5 col-span-6">
                <Button
                    label="Cancel"
                    style={ButtonStyle.Error}
                    icon={<XCircleIcon className="w-6 h-6 inline-block mr-3" />}
                    action={() => replace('/dashboard/shop')}
                />
                <Button
                    label="Delete"
                    style={ButtonStyle.Error}
                    icon={<TrashIcon className="w-6 h-6 inline-block mr-3" />}
                    action={() => replace('/dashboard/shop')}
                />
                <Button
                    label="Save Changes"
                    type="submit"
                    icon={<CheckCircleIcon className="w-6 h-6 inline-block mr-3" />}
                    action={() => console.log('clicked')}
                />
            </div>
        </form>
    )
}
