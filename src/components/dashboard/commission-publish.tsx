'use client'

import { EyeIcon, EyeOffIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '~/components/ui/button'
import { update_commission } from '~/server/actions/commission'

export default function CommissionPublishButton(props: {
    id: string
    published: boolean
}) {
    const [pending, setPending] = useState(false)
    const [currentlyPublished, setCurrentlyPublished] = useState(props.published)

    return (
        <Button
            variant={!currentlyPublished ? 'default' : 'destructive'}
            disabled={pending}
            onClick={async () => {
                const new_state = !currentlyPublished
                setPending(true)

                const toast_id = toast.loading('Updating commission')

                toast.success('Commission Updated!', {
                    id: toast_id
                })

                const res = await update_commission({
                    commission_id: props.id,
                    data: {
                        published: new_state
                    }
                })

                if (!res.success) {
                    toast.error('Failed to update commission', {
                        id: toast_id
                    })
                    setPending(false)
                    return
                }

                setCurrentlyPublished(new_state)
                setPending(false)
            }}
        >
            <ButtonText published={currentlyPublished} isLoading={pending} />
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
