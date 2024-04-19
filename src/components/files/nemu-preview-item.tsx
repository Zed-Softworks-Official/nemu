'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import NemuImage from '~/components/nemu-image'

export default function NemuPreviewItem({ preview, i }: { preview: string; i: number }) {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
        id: `nemu-upload-preview-${i}`
    })

    const style = {
        transition,
        transform: CSS.Transform.toString(transform)
    }

    return (
        <div
            className="w-32 cursor-grab hover:scale-110 transition-all duration-200 ease-in-out"
            ref={setNodeRef}
            style={style}
            {...listeners}
            {...attributes}
        >
            <NemuImage
                src={preview}
                alt="Image Preview"
                className="w-full h-fit rounded-xl"
                width={200}
                height={200}
            />
        </div>
    )
}
