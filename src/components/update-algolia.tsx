'use client'

import { api } from '~/trpc/react'
import { Button } from '~/components/ui/button'
import { useState } from 'react'
import { toast } from 'sonner'

export default function UpdateAlgoliaButtons() {
    const [toastId, setToastId] = useState<string | number | undefined>(undefined)

    const artist_mutation = api.algolia.load_artists.useMutation({
        onMutate: () => {
            setToastId(toast.loading('Updating Artist Index'))
        },
        onSuccess: () => {
            if (!toastId) return

            toast.success('Artist Index Updated!', {
                id: toastId
            })
        },
        onError: (e) => {
            if (!toastId) return

            toast.error(e.message, {
                id: toastId
            })
        }
    })

    const commmission_mutation = api.algolia.load_commissions.useMutation({
        onMutate: () => {
            setToastId(toast.loading('Updating Commission Index'))
        },
        onSuccess: () => {
            if (!toastId) return

            toast.success('Commission Index Updated!', {
                id: toastId
            })
        },
        onError: (e) => {
            if (!toastId) return

            toast.error(e.message, {
                id: toastId
            })
        }
    })

    return (
        <div className="flex flex-col gap-5">
            <Button
                disabled={artist_mutation.isPending || commmission_mutation.isPending}
                onMouseDown={() => {
                    artist_mutation.mutate()
                }}
            >
                Load Artists
            </Button>
            <Button
                disabled={commmission_mutation.isPending || artist_mutation.isPending}
                onMouseDown={() => {
                    commmission_mutation.mutate()
                }}
            >
                Load Commissions
            </Button>
        </div>
    )
}
