'use client'

import { EyeIcon, EyeOffIcon } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useState } from 'react'
import { Id } from 'react-toastify'
import { Button } from '~/components/ui/button'
import { nemu_toast } from '~/lib/utils'
import { api } from '~/trpc/react'

export default function CommissionPublishButton({
    id,
    published
}: {
    id: string
    published: boolean
}) {
    const [toastId, setToastId] = useState<Id | undefined>()
    const [currentlyPublished, setCurrentlyPublished] = useState(published)

    const { resolvedTheme } = useTheme()

    const mutation = api.commission.set_commission.useMutation({
        onMutate: (opts) => {
            if (opts.type === 'update') {
                setCurrentlyPublished(opts.data.published!)

                setToastId(
                    nemu_toast.loading('Updating commission', { theme: resolvedTheme })
                )
            }
        },
        onSuccess: () => {
            if (!toastId) return

            nemu_toast.update(toastId, {
                render: 'Commission Updated!',
                isLoading: false,
                autoClose: 5000,
                type: 'success'
            })
        },
        onError: (e) => {
            if (!toastId) return

            nemu_toast.update(toastId, {
                render: e.message,
                isLoading: false,
                autoClose: 5000,
                type: 'error'
            })
        }
    })

    return (
        <Button
            variant={!currentlyPublished ? 'default' : 'destructive'}
            disabled={mutation.isPending}
            onClick={() => {
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
                <EyeOffIcon className="w-6 h-6" />
                Unpublish
            </>
        )
    }

    return (
        <>
            <EyeIcon className="w-6 h-6" />
            Publish
        </>
    )
}
