'use client'

import Link from 'next/link'

import { z } from 'zod'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import { CheckCircle2Icon, SaveIcon, Trash2Icon, XCircleIcon } from 'lucide-react'

import { api } from '~/trpc/react'

import { Input } from '~/components/ui/input'
import { Button } from '~/components/ui/button'
import { Form, FormField, FormItem, FormLabel } from '~/components/ui/form'

import { useUploadThingContext } from '~/components/files/uploadthing-context'
import NemuUploadDropzone from '~/components/files/nemu-dropzone'
import NemuUploadPreview from '~/components/files/nemu-upload-preview'

import NemuUploadProgress from '~/components/files/nemu-upload-progress'
import { RouterOutput } from '~/core/structures'
import NemuImage from '~/components/nemu-image'
import { useTheme } from 'next-themes'
import { nemu_toast } from '~/lib/utils'

const portfolioSchema = z.object({
    name: z.string().min(2).max(50)
})

type PortfolioSchemaType = z.infer<typeof portfolioSchema>

export default function PortfolioCreateEditForm({
    data
}: {
    data?: RouterOutput['portfolio']['get_portfolio']
}) {
    const [disabled, setDisabled] = useState(false)

    const { upload } = useUploadThingContext()
    const { replace } = useRouter()
    const { resolvedTheme } = useTheme()

    /**
     * Create Mutation
     */
    const set_mutation = api.portfolio.set_portfolio_item.useMutation({
        onSuccess: () => {
            nemu_toast('Portfolio Item Created', {
                theme: resolvedTheme,
                type: 'success'
            })

            replace('/dashboard/portfolio')
        },
        onError: (e) => {
            nemu_toast('Error Creating Portfolio Item', {
                theme: resolvedTheme,
                type: 'error'
            })
        }
    })

    /**
     * Delete Mutation
     */
    const delete_mutation = api.portfolio.del_portfolio_item.useMutation({
        onSuccess: () => {
            nemu_toast('Portfolio Item Deleted!', {
                theme: resolvedTheme,
                type: 'success'
            })

            replace('/dashboard/portfolio')
        }
    })

    const form = useForm<PortfolioSchemaType>({
        resolver: zodResolver(portfolioSchema),
        mode: 'onSubmit',
        defaultValues: {
            name: data ? data.name : ''
        }
    })

    async function ProcessForm(values: PortfolioSchemaType) {
        setDisabled(true)

        if (data) {
            set_mutation.mutate({
                type: 'update',
                id: data.id,
                data: values
            })

            return
        }

        const res = await upload()

        if (!res) {
            throw new Error('Response should exist!')
        }

        set_mutation.mutate({
            type: 'create',
            data: {
                name: values.name,
                image: res[0]?.url!,
                utKey: res[0]?.key!
            }
        })
    }

    return (
        <Form {...form}>
            <NemuUploadProgress />
            <form
                className="flex flex-col gap-5 max-w-xl mx-auto"
                onSubmit={form.handleSubmit(ProcessForm)}
            >
                <FormField
                    name="name"
                    control={form.control}
                    render={({ field }) => (
                        <FormItem className="form-control">
                            <FormLabel className="label">Name:</FormLabel>
                            <Input placeholder="Name" {...field} />
                        </FormItem>
                    )}
                />
                {data ? (
                    <div className="card shadow-xl">
                        <figure>
                            <NemuImage
                                src={data.image.url}
                                placeholder="blur"
                                blurDataURL={data.image.blur_data}
                                alt="Portfolio Image"
                                width={200}
                                height={200}
                                className="w-full h-full rounded-xl"
                            />
                        </figure>
                    </div>
                ) : (
                    <>
                        <NemuUploadDropzone />
                        <NemuUploadPreview />
                    </>
                )}
                {data ? (
                    <div className="flex justify-between">
                        <Link href={'/dashboard/portfolio'} className="btn btn-outline">
                            <XCircleIcon className="w-6 h-6" />
                            Cancel
                        </Link>
                        <div className="flex gap-2">
                            <Button
                                variant={'destructive'}
                                type="button"
                                onClick={() => {
                                    delete_mutation.mutate({
                                        id: data.id,
                                        utKey: data.utKey
                                    })
                                }}
                            >
                                <Trash2Icon className="w-6 h-6" />
                                Delete
                            </Button>
                            <Button type="submit" disabled={disabled}>
                                <SaveIcon className="w-6 h-6" />
                                Save
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="flex justify-between">
                        <Link
                            href={'/dashboard/portfolio'}
                            className="btn btn-outline btn-error"
                        >
                            <XCircleIcon className="w-6 h-6" />
                            Cancel
                        </Link>
                        <Button type="submit" disabled={disabled}>
                            <CheckCircle2Icon className="w-6 h-6" />
                            Create Portfolio Item
                        </Button>
                    </div>
                )}
            </form>
        </Form>
    )
}
