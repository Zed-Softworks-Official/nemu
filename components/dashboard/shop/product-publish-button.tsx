'use client'

import { ClassNames } from '@/core/helpers'
import { api } from '@/core/trpc/react'
import { EyeIcon, EyeOffIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'react-toastify'

export default function ProductPublishButton({
    product_id,
    published
}: {
    product_id: string
    published: boolean
}) {
    const [loading, setLoading] = useState(false)
    const [currentlyPublished, setCurrentlyPublished] = useState(published)

    const mutation = api.artist_corner.update_product.useMutation()

    async function UpdatePublishedCommissionState(new_state: boolean) {
        setLoading(true)

        const res = await mutation.mutateAsync({
            product_id,
            product_data: {
                published: new_state
            }
        })

        if (!res.success) {
            toast('Failed to update commission!', { theme: 'dark', type: 'error' })
        } else {
            toast('Successfully Updated Commission', { theme: 'dark', type: 'success' })
        }

        setLoading(false)
        setCurrentlyPublished(new_state)
    }

    return (
        <button
            type="button"
            className={ClassNames(
                'btn',
                currentlyPublished ? 'btn-error' : 'btn-primary'
            )}
            onClick={() => {
                UpdatePublishedCommissionState(!currentlyPublished)
            }}
            disabled={loading}
        >
            {loading ? (
                <span className="loading loading-spinner"></span>
            ) : currentlyPublished ? (
                <>
                    <EyeOffIcon className="w-6 h-6" />
                    Unpublish
                </>
            ) : (
                <>
                    <EyeIcon className="w-6 h-6" />
                    Publish
                </>
            )}
        </button>
    )
}
