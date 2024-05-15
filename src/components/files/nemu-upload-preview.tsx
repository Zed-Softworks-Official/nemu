'use client'

import { cn } from '~/lib/utils'

import NemuImage from '~/components/nemu-image'
import { useUploadThingContext } from '~/components/files/uploadthing-context'
import { useDroppable } from '@dnd-kit/core'
import NemuPreviewItem from '~/components/files/nemu-preview-item'

export default function NemuUploadPreview({ className }: { className?: string }) {
    const { images } = useUploadThingContext()
    const { isOver, setNodeRef } = useDroppable({
        id: 'nemu-upload-preview'
    })

    if (images.length === 0) {
        return null
    }

    if (images.length === 1) {
        return (
            <div className={cn('card shadow-xl', className)}>
                <figure>
                    <NemuImage
                        src={images[0]?.image_data.url!}
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
                {images.map(
                    (preview, i) =>
                        preview.action !== 'delete' && (
                            <NemuPreviewItem
                                key={preview.image_data.url}
                                preview={preview.image_data.url}
                                i={i}
                            />
                        )
                )}
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
