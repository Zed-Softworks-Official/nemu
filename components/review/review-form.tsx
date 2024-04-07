'use client'

import * as z from 'zod'

import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import TextAreaInput from '../form/text-area'
import { api } from '@/core/trpc/react'

const reviewSchema = z.object({
    rating: z.number().min(1).max(5),
    description: z
        .string()
        .min(16, 'Must be longer the 16 characters')
        .max(512, 'Cannot exceed 512 characters')
})

type ReviewSchemaType = z.infer<typeof reviewSchema>

export default function ReviewForm({
    commission_id,
    request_id,
    product_id
}: {
    commission_id?: string
    request_id?: string
    product_id?: string
}) {
    const mutation = api.commissions.set_review.useMutation()
    const {
        handleSubmit,
        control,
        formState: { errors },
        register
    } = useForm<ReviewSchemaType>({
        resolver: zodResolver(reviewSchema),
        mode: 'onSubmit',
        defaultValues: {
            rating: 1
        }
    })

    function ProcessForm(values: ReviewSchemaType) {
        mutation.mutate({
            commission_id: commission_id!,
            request_id: request_id!,

            description: values.description,
            rating: values.rating
        })
    }

    return (
        <form className="flex flex-col gap-5" onSubmit={handleSubmit(ProcessForm)}>
            <Controller
                name="rating"
                control={control}
                render={({ field }) => (
                    <div className="form-control">
                        <label className="label">How did everything go?</label>
                        <div className="rating rating-lg">
                            <input
                                type="radio"
                                name="rating-7"
                                className="mask mask-star-2 bg-orange-400"
                                onClick={() => field.onChange(1)}
                                defaultChecked
                            />
                            <input
                                type="radio"
                                name="rating-7"
                                className="mask mask-star-2 bg-orange-400"
                                onClick={() => field.onChange(2)}
                            />
                            <input
                                type="radio"
                                name="rating-7"
                                className="mask mask-star-2 bg-orange-400"
                                onClick={() => field.onChange(3)}
                            />
                            <input
                                type="radio"
                                name="rating-7"
                                className="mask mask-star-2 bg-orange-400"
                                onClick={() => field.onChange(4)}
                            />
                            <input
                                type="radio"
                                name="rating-7"
                                className="mask mask-star-2 bg-orange-400"
                                onClick={() => field.onChange(5)}
                            />
                        </div>
                    </div>
                )}
            />
            <TextAreaInput
                label="Description"
                placeholder="Tell us about the experience"
                additionalClasses="h-72"
                {...register('description')}
                error={errors.description ? true : false}
                errorMessage={errors.description?.message}
            />
            <div className="flex justify-end items-end w-full">
                <button
                    type="submit"
                    className="btn btn-wide btn-primary"
                    disabled={mutation.isPending}
                >
                    Submit Review
                </button>
            </div>
        </form>
    )
}
