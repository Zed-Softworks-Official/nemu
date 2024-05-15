'use client'

import Image from 'next/image'
import { Trash2Icon } from 'lucide-react'

import { CSS } from '@dnd-kit/utilities'
import { useSortable } from '@dnd-kit/sortable'

import {
    ContextMenu,
    ContextMenuTrigger,
    ContextMenuContent,
    ContextMenuItem
} from '~/components/ui/context-menu'
import { useUploadThingContext } from '~/components/files/uploadthing-context'

export default function NemuPreviewItem({
    preview,
    i
}: {
    preview: string | null
    i: number
}) {
    const { images, setImages } = useUploadThingContext()
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
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <div
                    className="relative w-32 cursor-grab transition-all duration-200 ease-in-out hover:scale-110"
                    ref={setNodeRef}
                    style={style}
                    {...listeners}
                    {...attributes}
                >
                    <Image
                        src={preview}
                        alt="Image Preview"
                        className="h-fit w-full rounded-xl"
                        width={200}
                        height={200}
                    />
                </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
                <ContextMenuItem
                    onClick={() => {
                        if (images.length === 0) {
                            setImages((prev) => {
                                prev[i]!.action = 'delete'
                                return prev
                            })
                        }
                    }}
                >
                    <Trash2Icon className="h-6 w-6" />
                    Delete
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    )
}
