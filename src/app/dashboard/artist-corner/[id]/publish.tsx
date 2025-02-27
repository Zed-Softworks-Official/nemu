'use client'

import { Eye, EyeOff } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '~/components/ui/button'
import { api } from '~/trpc/react'

export default function PublishProduct(props: { id: string; published: boolean }) {
    const [currentlyPublished, setCurrentlyPublished] = useState(props.published)
    const variant = useMemo(() => {
        if (currentlyPublished) {
            return 'destructive'
        }

        return 'default'
    }, [currentlyPublished])

    const publishProduct = api.artist_corner.publish_product_by_id.useMutation({
        onMutate: () => {
            const toast_id = toast.loading('Updating')

            return { toast_id }
        },
        onSuccess: (_, __, ctx) => {
            toast.success('Updated', { id: ctx.toast_id })
        },
        onError: (_, __, ctx) => {
            toast.error('Failed to update', { id: ctx?.toast_id })
        }
    })

    const handlePublish = useCallback(() => {
        publishProduct.mutate({
            id: props.id,
            published: !currentlyPublished
        })

        setCurrentlyPublished(!currentlyPublished)
    }, [currentlyPublished, publishProduct, props.id])

    return (
        <Button
            variant={variant}
            onClick={handlePublish}
            disabled={publishProduct.isPending}
        >
            {currentlyPublished ? (
                <>
                    <EyeOff className="size-4" />
                    <span>Unpublish</span>
                </>
            ) : (
                <>
                    <Eye className="size-4" />
                    <span>Publish</span>
                </>
            )}
        </Button>
    )
}
