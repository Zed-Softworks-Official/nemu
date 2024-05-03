'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Trash2Icon } from 'lucide-react'

import NemuImage from '~/components/nemu-image'
import { Button } from '~/components/ui/button'

export default function NemuPreviewItem({
    preview,
    i
}: {
    preview: string | null
    i: number
}) {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
        id: `nemu-upload-preview-${i}`,
        data: {
            preview
        }
    })

    const style = {
        transition,
        transform: CSS.Transform.toString(transform)
    }

    if (!preview) {
        return null
    }

    return (
        <div
            className="relative w-32 cursor-grab transition-all duration-200 ease-in-out hover:scale-110"
            ref={setNodeRef}
            style={style}
            {...listeners}
            {...attributes}
        >
            <NemuImage
                src={preview}
                alt="Image Preview"
                className="h-fit w-full rounded-xl"
                width={200}
                height={200}
            />
            <div className="absolute hidden h-full w-full bg-black/80 hover:block">
                <div className="flex h-full w-full flex-col items-center justify-center">
                    <Button
                        variant={'destructive'}
                        onClick={() => {
                            console.log('Delete image')
                        }}
                    >
                        <Trash2Icon className="h-6 w-6" />
                    </Button>
                </div>
            </div>
        </div>
    )
}
