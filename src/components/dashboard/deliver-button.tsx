'use client'

import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '~/components/ui/button'
import { api } from '~/trpc/react'

export default function DeliverButton(props: {
    order_id: string
    download_id: string | null
}) {
    const [toastId, setToastId] = useState<string | number | undefined>(undefined)

    const mutation = api.requests.mark_as_delivered.useMutation({
        onMutate: () => {
            setToastId(toast.loading('Marking as Delivered'))
        },
        onSuccess: () => {
            if (!toastId) return

            toast.success('Delivered!', {
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
        <Button
            disabled={props.download_id === null}
            onMouseDown={() => {
                mutation.mutate(props.order_id)
            }}
        >
            Mark As Delivered
        </Button>
    )
}
