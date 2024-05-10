'use client'

import { cn } from '~/lib/utils'

import NemuImage from '~/components/nemu-image'
import { useUploadThingContext } from '~/components/files/uploadthing-context'
import { useDroppable } from '@dnd-kit/core'
import NemuPreviewItem from '~/components/files/nemu-preview-item'

export default function NemuUploadPreview({ className }: { className?: string }) {
    const { filePreviews, editPreviews } = useUploadThingContext()
    const { isOver, setNodeRef } = useDroppable({
        id: 'nemu-upload-preview'
    })

    if (editPreviews.length !== 0) {
        return (
            <div
                className={cn(
                    'flex flex-col gap-5 rounded-xl bg-base-200 p-5 shadow-xl',
                    className
                )}
            >
                <div className="flex flex-row gap-5" ref={setNodeRef}>
                    {editPreviews.map((preview, i) => (
                        <NemuPreviewItem key={preview} preview={preview} i={i} />
                    ))}
                </div>
                <span className="italic text-base-content/60">
                    Note: The first image will be the featured image or cover image
                </span>
            </div>
        )
    }

    if (filePreviews.length === 0) {
        return null
    }

    if (filePreviews.length === 1) {
        return (
            <div className={cn('card shadow-xl', className)}>
                <figure>
                    <NemuImage
                        src={filePreviews[0]!}
                        alt="Image Preview"
                        className="h-full w-full"
                        width={200}
                        height={200}
                    />
                </figure>
            </div>
        )
    }

    return (
        <div
            className={cn(
                'flex flex-col gap-5 rounded-xl bg-base-200 p-5 shadow-xl',
                className
            )}
        >
            <div className="flex flex-row gap-5" ref={setNodeRef}>
                {filePreviews.map((preview, i) => (
                    <NemuPreviewItem key={preview} preview={preview} i={i} />
                ))}
            </div>
            <span className="italic text-base-content/60">
                Note: The first image will be the featured image or cover image
            </span>
        </div>
    )
}

// function EditPreview() {
//     return null
// }
