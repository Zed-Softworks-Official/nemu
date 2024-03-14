'use client'

import FormDropzone from '@/components/form/form-dropzone'

import { useFormContext } from '@/components/form/form-context'
import { useRouter } from 'next/navigation'
import { toast } from 'react-toastify'
import { useDashboardContext } from '@/components/navigation/dashboard/dashboard-context'

import * as z from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import TextField from '@/components/form/text-input'
import MarkdownEditor from '@/components/form/markdown-text-area'
import CurrencyField from '@/components/form/currency-field'
import ImageEditor from '@/components/form/image-editor/image-editor'
import { AWSLocations, ShopItem, StoreProductInputType } from '@/core/structures'
import FormSubmitButtons from './submit-buttons'
import FileField from '@/components/form/file-input'
import { GraphQLFetcher } from '@/core/helpers'
import { NemuResponse, StatusCode } from '@/core/responses'
import { useState } from 'react'
import { CheckCircleIcon } from '@heroicons/react/20/solid'
import NemuImage from '@/components/nemu-image'
import Link from 'next/link'
import ProductPublishButton from '../shop/product-publish-button'

const productSchema = z.object({
    title: z.string(),
    description: z.string(),
    price: z.number().min(0),

    featured_image: z.any().optional(),
    additional_images: z.any().optional(),

    downloadable_asset: z.any().optional()
})

type ProductSchemaType = z.infer<typeof productSchema>

export default function ShopCreateEditForm({ data }: { data?: ShopItem }) {
    const { artistId } = useDashboardContext()
    const { image, additionalImages } = useFormContext()

    const [submitting, setSubmitting] = useState(false)

    const form = useForm<ProductSchemaType>({
        resolver: zodResolver(productSchema),
        mode: 'onSubmit',
        defaultValues: {
            title: data ? data.title : '',
            description: data ? data.description : '',
            price: data ? data.price : 0
        }
    })

    const { replace } = useRouter()

    async function SubmitProduct(values: ProductSchemaType) {
        setSubmitting(true)

        if (data) {
            UpdateProduct(values)
            return
        }

        CreateProduct(values)
    }

    async function CreateProduct(values: ProductSchemaType) {
        const toast_id = toast.loading('Creating Product', { theme: 'dark' })

        const featured_image_key = crypto.randomUUID()
        const downloadable_asset_key = crypto.randomUUID() + '.zip'
        const additionalImagesStringList: string[] = []

        // Create formdata for the aws files
        const awsData = new FormData()
        awsData.append('featured_image', image!)
        awsData.append('featured_image_key', featured_image_key)

        awsData.append('downloadable_asset_key', downloadable_asset_key)
        awsData.append('downloadable_asset', values.downloadable_asset[0])

        awsData.append('additional_files', JSON.stringify(additionalImages!))

        for (const imageFile of additionalImages!) {
            awsData.append(`file-${imageFile.file_key}`, imageFile.updated_file!)
            additionalImagesStringList.push(imageFile.file_key)
        }

        // Make Request to AWS Rest API to handle multiple files
        await fetch(`/api/aws/${artistId}/store/multiple`, {
            method: 'post',
            body: awsData
        })

        // Make request to GraphQL to create new shop object
        const graphql_response = await GraphQLFetcher<{ create_product: NemuResponse }>(
            `mutation CreateStoreMutation($product_data: StoreProductInputType!) {
                create_product(artist_id: "${artistId}", product_data: $product_data) {
                    status
                    message
                }
            }`,
            {
                product_data: {
                    title: values.title,
                    description: values.description,
                    price: values.price,
                    featured_image: featured_image_key,
                    additional_images: additionalImagesStringList,
                    downloadable_asset: downloadable_asset_key
                }
            }
        )

        if (graphql_response.create_product.status! != StatusCode.Success) {
            toast.update(toast_id, {
                render: graphql_response.create_product.message,
                type: 'error',
                autoClose: 5000,
                isLoading: false
            })
        } else {
            toast.update(toast_id, {
                render: 'Product Created',
                type: 'success',
                autoClose: 5000,
                isLoading: false
            })
        }

        replace('/dashboard/shop')
    }

    async function UpdateProduct(values: ProductSchemaType) {
        const toast_id = toast.loading('Updating Product', { theme: 'dark' })

        let update_data: StoreProductInputType = {
            title: values.title,
            description: values.description,
            price: values.price
        }

        // Update download file if it changed
        if (values.downloadable_asset.length != 0) {
            const awsData = new FormData()
            awsData.append('file', values.downloadable_asset[0])
            awsData.append('new_image_key', data?.download_key!)

            const response = await fetch(`/api/aws/${artistId}/downloads/${data?.download_key!}`, { method: 'post', body: awsData })
            const json = (await response.json()) as NemuResponse

            if (json.status != StatusCode.Success) {
                toast.update(toast_id, {
                    render: 'An Error has occured upating the download file!',
                    type: 'error',
                    autoClose: 5000,
                    isLoading: false
                })

                return
            }
        }

        // Update Additional Images if any
        if (additionalImages?.length != 0 || image) {
            const awsData = new FormData()

            // Handle Featured Image Update
            if (image) {
                update_data.featured_image = crypto.randomUUID()

                awsData.append('old_featured_key', data?.featured_image.image_key!)
                awsData.append('featured_image', image!)
                awsData.append('featured_image_key', update_data.featured_image)
            }

            if (additionalImages?.length != 0) {
                // Initialize the array
                update_data.additional_images = []

                // Add the updated files information
                awsData.append('additional_files', JSON.stringify(additionalImages))

                // Add the updated file data
                for (const imageFile of additionalImages!) {
                    awsData.append(`file-${imageFile.file_key}`, imageFile.updated_file!)
                    update_data.additional_images?.push(imageFile.file_key)
                }
            }

            await fetch(`/api/aws/${artistId}/store/multiple/update`, {
                method: 'post',
                body: awsData
            })
        }

        // Update the data
        const graphql_response = await GraphQLFetcher<{ update_product: NemuResponse }>(
            `mutation UpdateStoreMutation($product_data: StoreProductInputType!) {
                update_product(product_id: "${data?.id}", product_data: $product_data) {
                    status
                    message
                }
            }`,
            {
                product_data: update_data
            }
        )

        if (graphql_response.update_product.status! != StatusCode.Success) {
            toast.update(toast_id, {
                render: graphql_response.update_product.message,
                type: 'error',
                autoClose: 5000,
                isLoading: false
            })
        } else {
            toast.update(toast_id, {
                render: 'Product Updated',
                type: 'success',
                autoClose: 5000,
                isLoading: false
            })
        }

        setSubmitting(false)
        replace('/dashboard/shop')
    }

    return (
        <div className="max-w-xl mx-auto">
            {data && (
                <div className="flex justify-between items-center">
                    <h2 className="card-title">Edit Visibility</h2>
                    <ProductPublishButton product_id={data.id!} published={true} />
                </div>
            )}
            <div className="divider"></div>
            <form className="flex flex-col gap-5" onSubmit={form.handleSubmit(SubmitProduct)}>
                <TextField label="Product Name" placeholder="Your product name here!" {...form.register('title')} />
                <Controller
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                        <MarkdownEditor
                            label="Description"
                            markdown={field.value}
                            placeholder="Enter a description for your product"
                            input_name={field.name}
                            change_event={field.onChange}
                        />
                    )}
                />
                <CurrencyField min={0} label="Price" placeholder="Price" {...form.register('price', { valueAsNumber: true })} />
                <div className="divider"></div>
                <FormDropzone label="Featured Image" {...form.register('featured_image')} />
                {data && (
                    <div className="card shadow-xl bg-base-100">
                        <div className="card-body">
                            <h2 className="card-title">Current Featured Image</h2>
                            <div className="divider"></div>
                            <NemuImage src={data.featured_image.signed_url} alt="Featured Image" className="w-full h-full" width={400} height={400} />
                        </div>
                    </div>
                )}
                <ImageEditor
                    label="Additional Images"
                    location={AWSLocations.Store}
                    {...form.register('additional_images')}
                    edit_mode={data ? true : false}
                    images={data && data.edit_images}
                />
                <div className="divider"></div>
                <FileField label="Downloadable Asset" {...form.register('downloadable_asset')} accept="application/zip" />
                {data && (
                    <div className="card shadow-xl bg-base-100">
                        <div className="card-body">
                            <h2 className="card-title">Current Downloadable Asset</h2>
                            <div className="divider"></div>
                            <Link href={data.downloadable_asset!} download className="btn btn-primary">
                                Download
                            </Link>
                        </div>
                    </div>
                )}
                <div className="divider"></div>
                <FormSubmitButtons
                    cancel_url="/dashboard/shop"
                    button_icon={submitting ? <span className="loading loading-spinner"></span> : <CheckCircleIcon className="w-6 h-6" />}
                    disabled={submitting}
                    submit_text={
                        submitting ? <>{data ? 'Updating Product' : 'Creating Product'}</> : <>{data ? 'Update Product' : 'Create Product'}</>
                    }
                />
            </form>
        </div>
    )
}
