'use client'

import { toast } from 'react-toastify'
import { useRouter } from 'next/navigation'
import React, { useState } from 'react'

import FormDropzone from '@/components/form/form-dropzone'
import { CheckCircleIcon } from '@heroicons/react/20/solid'
import { useFormContext } from '@/components/form/form-context'
import { useDashboardContext } from '@/components/navigation/dashboard/dashboard-context'

import * as z from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import TextField from '@/components/form/text-input'
import FileField from '@/components/form/file-input'
import { GraphQLFetcher } from '@/core/helpers'
import { NemuResponse, StatusCode } from '@/core/responses'
import { GraphQLClient } from 'graphql-request'

const portfolioSchema = z.object({
    name: z.string().min(2).max(50),
    file: z.any(z.instanceof(File).refine((file: File) => file.size != 0))
})

type PortfolioSchemaType = z.infer<typeof portfolioSchema>

export default function PortfolioAddForm() {
    const { image } = useFormContext()

    const [isLoading, setIsLoading] = useState(false)
    const { artistId } = useDashboardContext()
    const { push } = useRouter()

    const form = useForm<PortfolioSchemaType>({
        resolver: zodResolver(portfolioSchema),
        mode: 'onSubmit'
    })

    async function CreatePortfolioItem(values: PortfolioSchemaType) {
        setIsLoading(true)

        const toast_uploading = toast.loading('Uploading', { theme: 'dark' })

        // Generate Key
        const image_key = crypto.randomUUID()

        const formData = new FormData()
        formData.append('file', values.file[0])

        console.log(values.file)

        // Upload File
        const upload_response = await fetch(
            `/api/aws/${artistId}/portfolio/${image_key}`,
            {
                method: 'post',
                body: formData
            }
        )
        const upload_json = (await upload_response.json()) as NemuResponse

        if (upload_json.status != StatusCode.Success) {
            toast.update(toast_uploading, {
                render: 'Error uploading file',
                type: 'error',
                autoClose: 5000,
                isLoading: false
            })
            return
        }

        // Update database
        const database_response = await GraphQLFetcher(`mutation {
            create_portfolio_item(artist_id: "${artistId}", image: "${image_key}", name: "${values.name}") {
              status
            }
          }`)

        if ((database_response as { status: StatusCode }).status != StatusCode.Success) {
            toast.update(toast_uploading, {
                render: 'Error saving to database',
                type: 'error',
                autoClose: 5000,
                isLoading: false
            })
            return
        }

        toast.update(toast_uploading, {
            render: 'Portfolio Item Created',
            type: 'success',
            autoClose: 5000,
            isLoading: false
        })

        push('/dashboard/portfolio')
    }

    return (
        <div className="max-w-xl mx-auto">
            <form
                className="flex flex-col gap-5"
                onSubmit={form.handleSubmit(CreatePortfolioItem)}
            >
                <TextField label="Title" placeholder="Title" {...form.register('name')} />
                <FileField label="Artwork" multiple={false} {...form.register('file')} />
                <div className="flex flex-row items-center justify-center">
                    <button
                        type="submit"
                        className="btn btn-primary w-full"
                        disabled={isLoading}
                    >
                        <CheckCircleIcon className="w-6 h-6" />
                        Create Item
                    </button>
                </div>
            </form>
        </div>
    )
}
