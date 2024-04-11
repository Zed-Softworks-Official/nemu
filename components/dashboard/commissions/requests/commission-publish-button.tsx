'use client'

import { ClassNames } from '@/core/helpers'
import { NemuResponse, StatusCode } from '@/core/responses'
import { api } from '@/core/api/react'
import { EyeIcon, EyeOffIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'react-toastify'

export default function CommissionPublishButton({
    commission_id,
    published
}: {
    commission_id: string
    published: boolean
}) {
    const [loading, setLoading] = useState(false)
    const [currentlyPublished, setCurrentlyPublished] = useState(published)

    const mutation = api.commissions.update_commission.useMutation()

    async function UpdatePublishedCommissionState(new_state: boolean) {
        setLoading(true)

        mutation
            .mutateAsync({
                commission_id,
                commission_data: {
                    published: new_state
                }
            })
            .then((res) => {
                setLoading(false)
                setCurrentlyPublished(new_state)

                if (!res.success) {
                    toast('Unable to publish commission', {
                        theme: 'dark',
                        type: 'error'
                    })

                    return
                }

                toast('Successfully published commission', {
                    theme: 'dark',
                    type: 'success'
                })
            })
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
