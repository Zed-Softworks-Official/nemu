'use client'

import { ClassNames, GraphQLFetcherVariables } from '@/core/helpers'
import { NemuResponse, StatusCode } from '@/core/responses'
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/20/solid'
import { useState } from 'react'
import { toast } from 'react-toastify'

export default function ProductPublishButton({ product_id, published }: { product_id: string; published: boolean }) {
    const [loading, setLoading] = useState(false)
    const [currentlyPublished, setCurrentlyPublished] = useState(published)

    async function UpdatePublishedCommissionState(new_state: boolean) {
        setLoading(true)

        const response = await GraphQLFetcherVariables<{ update_store_item: NemuResponse }>({
            query: `mutation UpdateStoreItem($product_data: StoreProductInputType!) {
                    update_store_item(product_id: "${product_id}", product_data: $product_data) {
                        status
                        message
                    }
                }`,
            variables: {
                product_data: {
                    published: new_state
                }
            }
        })

        if (response.update_store_item.status == StatusCode.Success) {
            toast('Successfully Updated Commission', { theme: 'dark', type: 'success' })
        } else {
            toast(response.update_store_item.message, { theme: 'dark', type: 'error' })
        }

        setLoading(false)
        setCurrentlyPublished(new_state)
    }

    return (
        <button
            type="button"
            className={ClassNames('btn', currentlyPublished ? 'btn-error' : 'btn-primary')}
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
