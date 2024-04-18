'use client'

import Link from 'next/link'

import { z } from 'zod'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import { CheckCircle2Icon, CheckCircleIcon, Trash2Icon, XCircleIcon } from 'lucide-react'
import { toast } from 'sonner'

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

const portfolioSchema = z.object({
    name: z.string().min(2).max(50)
})

type PortfolioSchemaType = z.infer<typeof portfolioSchema>

export default function PortfolioCreateEditForm({
    data
}: {
    data?: RouterOutput['portfolio']['get_portfolio_item']
}) {
    const [disabled, setDisabled] = useState(false)

    const { upload } = useUploadThingContext()
    const { replace } = useRouter()

    const mutation = api.portfolio.set_portfolio_item.useMutation({
        onSuccess: () => {
            toast('Portfolio Item Created!', {
                icon: <CheckCircleIcon className="w-6 h-6 text-success" />
            })

            replace('/dashboard/portfolio')
        },
        onError: (e) => {
            toast('Error Creating Portfolio Item', {
                icon: <XCircleIcon className="w-6 h-6 text-error" />
            })
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

        const res = await upload()

        if (!res) {
            throw new Error('Response should exist!')
        }

        mutation.mutate({
            name: values.name,
            image: res[0]?.url!,
            utKey: res[0]?.key!
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
                        <Button variant={'destructive'} type="button" onClick={() => {}}>
                            <Trash2Icon className="w-6 h-6" />
                            Delete
                        </Button>
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
