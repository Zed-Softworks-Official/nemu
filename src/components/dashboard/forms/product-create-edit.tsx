'use client'

import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import { Form, FormField, FormItem, FormLabel } from '~/components/ui/form'
import { Input } from '~/components/ui/input'
import { Textarea } from '~/components/ui/textarea'
import { CircleDollarSignIcon } from 'lucide-react'
import NemuUploadThing from '~/components/files/nemu-uploadthing'

const productSchema = z.object({
    title: z.string(),
    description: z.string(),
    price: z.number().min(0),

    images: z.array(z.string()).min(1).max(5),

    downloadable_asset: z.string()
})

type ProductSchemaType = z.infer<typeof productSchema>

export default function ProductCreateEditForm() {
    const form = useForm<ProductSchemaType>({
        resolver: zodResolver(productSchema),
        mode: 'onSubmit'
    })

    return (
        <div className="max-w-xl mx-auto">
            <Form {...form}>
                <form className="flex flex-col gap-5">
                    <FormField
                        control={form.control}
                        name="title"
                        render={({ field }) => (
                            <FormItem className="form-control">
                                <FormLabel className="label">Title:</FormLabel>
                                <Input placeholder="My Product" {...field} />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="description"
                        render={({ field }) => (
                            <FormItem className="form-control">
                                <FormLabel className="label">Description:</FormLabel>
                                <Textarea
                                    className="resize-none"
                                    rows={10}
                                    placeholder="It's pretty cool, it gives like things and stuff you know"
                                    {...field}
                                />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="price"
                        render={({ field }) => (
                            <FormItem className="form-control">
                                <FormLabel className="label">Price:</FormLabel>
                                <div className="join w-full">
                                    <div className="flex items-center justify-center px-5 bg-base-200 join-item">
                                        <CircleDollarSignIcon className="w-6 h-6" />
                                    </div>
                                    <Input
                                        placeholder="Name your price"
                                        type="number"
                                        inputMode="numeric"
                                        className="w-full join-item"
                                        {...field}
                                    />
                                </div>
                            </FormItem>
                        )}
                    />
                    <div className="form-control">
                        <FormLabel className="label">Images:</FormLabel>
                        <NemuUploadThing />
                    </div>
                </form>
            </Form>
        </div>
    )
}
