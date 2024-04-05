'use client'

import * as z from 'zod'
import MarkdownEditor from '../form/markdown-text-area'

import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'

const reviewSchema = z.object({
    rating: z.number().min(1).max(5),
    description: z.string()
})

type ReviewSchemaType = z.infer<typeof reviewSchema>

export default function ReviewForm() {
    const { register, control } = useForm<ReviewSchemaType>({
        resolver: zodResolver(reviewSchema),
        mode: 'onSubmit',
        defaultValues: {
            description: ''
        }
    })

    return (
        <form className="flex flex-col gap-5">
            <div className="form-control">
                <label className="label">How did everything go?</label>
                <div className="rating rating-lg">
                    <input
                        type="radio"
                        name="rating-7"
                        className="mask mask-star-2 bg-orange-400"
                        defaultChecked
                    />
                    <input
                        type="radio"
                        name="rating-7"
                        className="mask mask-star-2 bg-orange-400"
                    />
                    <input
                        type="radio"
                        name="rating-7"
                        className="mask mask-star-2 bg-orange-400"
                    />
                    <input
                        type="radio"
                        name="rating-7"
                        className="mask mask-star-2 bg-orange-400"
                    />
                    <input
                        type="radio"
                        name="rating-7"
                        className="mask mask-star-2 bg-orange-400"
                    />
                </div>
            </div>
            <Controller
                name="description"
                control={control}
                render={({ field }) => (
                    <MarkdownEditor
                        label="Description"
                        markdown={field.value}
                        input_name={field.name}
                        placeholder="Tell us about the experience"
                        change_event={field.onChange}
                    />
                )}
            />
        </form>
    )
}
