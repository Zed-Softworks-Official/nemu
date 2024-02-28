'use client'

import NemuImage from '@/components/nemu-image'
import { AWSFileModification } from '@/core/structures'
import { useDraggable } from '@dnd-kit/core'
import { TrashIcon } from '@heroicons/react/20/solid'

export default function ImageDraggable({
    image,
    index,
    RemoveImage
}: {
    image: AWSFileModification
    index: number
    RemoveImage: (i: number) => void
}) {
    const {
        attributes,
        listeners,
        setNodeRef: draggableNodeRef,
        transform
    } = useDraggable({
        id: `image-${image.file_key}`
    })

    return (
        <div key={image.file_key} className="rounded-xl cursor-pointer overflow-hidden" ref={draggableNodeRef} {...listeners} {...attributes}>
            <div className="relative">
                <NemuImage src={image.blob!} alt="image" width={200} height={200} className="block w-28 h-full" />
                <div className="absolute top-0 w-full h-full bg-base-300/80 transition-opacity duration-200 opacity-0 hover:opacity-100">
                    <div className="flex w-full h-full justify-center items-center text-center">
                        <button type="button" className="btn btn-error btn-circle" onClick={() => RemoveImage(index)}>
                            <TrashIcon className="w-6 h-6" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
