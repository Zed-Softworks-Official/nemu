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

const portfolioSchema = z.object({
    name: z.string().min(2).max(50),
    file: z.any().refine((file: File) => file.size != 0, 'File is required')
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

    async function CreatePortfolioItem(value: PortfolioSchemaType) {
        setIsLoading(true)
        console.log(value)

        

        // try {
        //     const formData = new FormData(event.currentTarget)
        //     if (!image) {
        //         toast.error('Error: Portfolio Item Incomplete', {
        //             theme: 'dark'
        //         })
        //         setIsLoading(false)
        //         return
        //     }

        //     formData.set('dropzone-file', image)

        //     let filename = crypto.randomUUID()

        //     toast
        //         .promise(
        //             fetch(`/api/portfolio/${handle}/item/${filename}`, {
        //                 method: 'POST',
        //                 body: formData
        //             }),
        //             {
        //                 pending: 'Uploading Image',
        //                 success: 'Upload Successful',
        //                 error: 'Upload Failed'
        //             },
        //             {
        //                 theme: 'dark'
        //             }
        //         )
        //         .then(() => {
        //             setIsLoading(false)

        //             push('/dashboard/portfolio')
        //         })
        // } catch (error) {
        //     console.log(error)
        // }
    }

    return (
        <div className="max-w-xl mx-auto">
            <form
                className="flex flex-col gap-5"
                onSubmit={form.handleSubmit(CreatePortfolioItem)}
            >
                <TextField label="Title" placeholder="Title" {...form.register('name')} />
                <FileField label="Artwork" multiple={false} {...form.register('file')} />
                {/* <FormDropzone label="Your beautiful artwork here" /> */}
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
