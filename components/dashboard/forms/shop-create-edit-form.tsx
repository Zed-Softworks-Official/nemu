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
import { AWSLocations } from '@/core/structures'
import FormSubmitButtons from './submit-buttons'
import FileField from '@/components/form/file-input'
import { GraphQLFetcher } from '@/core/helpers'
import { NemuResponse, StatusCode } from '@/core/responses'

const productSchema = z.object({
    name: z.string(),
    description: z.string(),
    price: z.number().min(0),

    featured_image: z.any().optional(),
    additional_images: z.any().optional(),

    downloadable_asset: z.any(z.instanceof(FileList)).refine((file: FileList) => file.length !== 0, 'File is required!')
})

type ProductSchemaType = z.infer<typeof productSchema>

export default function ShopCreateEditForm() {
    const { artistId } = useDashboardContext()
    const { image, additionalImages } = useFormContext()

    const form = useForm<ProductSchemaType>({
        resolver: zodResolver(productSchema),
        mode: 'onSubmit',
        defaultValues: {
            name: '',
            description: '',
            price: 0
        }
    })

    const { replace } = useRouter()

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
        const graphql_response = await GraphQLFetcher<{ create_store_item: NemuResponse }>(
            `mutation CreateStoreMutation($product_data: StoreProductInputType!) {
                create_store_item(artist_id: "${artistId}", product_data: $product_data) {
                    status
                    message
                }
            }`,
            {
                product_data: {
                    name: values.name,
                    description: values.description,
                    price: values.price,
                    featured_image: featured_image_key,
                    additional_images: additionalImagesStringList,
                    downloadable_asset: downloadable_asset_key
                }
            }
        )

        if (graphql_response.create_store_item.status! != StatusCode.Success) {
            toast.update(toast_id, {
                render: graphql_response.create_store_item.message,
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

    return (
        <div className="max-w-xl mx-auto">
            <form className="flex flex-col gap-5" onSubmit={form.handleSubmit(CreateProduct)}>
                <TextField label="Product Name" placeholder="Your product name here!" {...form.register('name')} />
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
                <ImageEditor label="Additional Images" location={AWSLocations.Store} {...form.register('additional_images')} />
                <div className="divider"></div>
                <FileField label="Downloadable Asset" {...form.register('downloadable_asset')} accept="application/zip" />
                <div className="divider"></div>
                <FormSubmitButtons cancel_url="/dashboard/shop" submit_text="Add Product" />
            </form>
        </div>
    )
}
