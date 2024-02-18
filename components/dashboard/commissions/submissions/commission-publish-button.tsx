'use client'

import { ClassNames, GraphQLFetcher } from '@/core/helpers'
import { NemuResponse, StatusCode } from '@/core/responses'
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/20/solid'
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

    async function UpdatePublishedCommissionState(new_state: boolean) {
        setLoading(true)

        const response = await GraphQLFetcher<{ update_commission: NemuResponse }>(`
            mutation {
                update_commission(commission_id: "${commission_id}", published: ${new_state}) {
                    status
                    message
                }
            }`)

        if (response.update_commission.status == StatusCode.Success) {
            toast('Successfully Updated Commission', { theme: 'dark', type: 'success' })
        } else {
            toast(response.update_commission.message, { theme: 'dark', type: 'error' })
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
                    <EyeSlashIcon className="w-6 h-6" />
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
