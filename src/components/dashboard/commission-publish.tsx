'use client'

import { EyeIcon, EyeOffIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '~/components/ui/button'

export default function CommissionPublishButton({
    id,
    published
}: {
    id: string
    published: boolean
}) {
    const [toastId, setToastId] = useState<string | number | undefined>()
    const [currentlyPublished, setCurrentlyPublished] = useState(published)

    const mutation = api.commission.set_commission.useMutation({
        onMutate: (opts) => {
            if (opts.type === 'update') {
                setCurrentlyPublished(opts.data.published!)

                setToastId(toast.loading('Updating commission'))
            }
        },
        onSuccess: () => {
            if (!toastId) return

            toast.success('Commission updated!', {
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
            variant={!currentlyPublished ? 'default' : 'destructive'}
            disabled={mutation.isPending}
            onMouseDown={() => {
                mutation.mutate({
                    type: 'update',
                    commission_id: id,
                    data: {
                        published: !currentlyPublished
                    }
                })
            }}
        >
            <ButtonText published={currentlyPublished} isLoading={mutation.isPending} />
        </Button>
    )
}

function ButtonText({
    published,
    isLoading
}: {
    published: boolean
    isLoading: boolean
}) {
    if (isLoading) {
        return (
            <>
                <span className="loading loading-spinner"></span>
                Loading
            </>
        )
    }

    if (published) {
        return (
            <>
                <EyeOffIcon className="h-6 w-6" />
                Unpublish
            </>
        )
    }

    return (
        <>
            <EyeIcon className="h-6 w-6" />
            Publish
        </>
    )
}
