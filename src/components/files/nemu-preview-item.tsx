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
import type { ImageEditorData  } from '~/core/structures'
import { cn } from '~/lib/utils'

export default function NemuPreviewItem({
    preview,
    onDelete,
    index
}: {
    preview: ImageEditorData
    onDelete: (index: number) => void
    index: number
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
        useSortable({
            id: preview.id,
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
                    className={cn(
                        isDragging && 'opacity-50',
                        'relative w-32 cursor-grab transition-all duration-200 ease-in-out hover:scale-110'
                    )}
                    ref={setNodeRef}
                    style={style}
                    {...listeners}
                    {...attributes}
                >
                    <Image
                        src={preview.data.image_data.url}
                        alt="Image Preview"
                        className="h-fit w-full rounded-xl"
                        width={200}
                        height={200}
                    />
                </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
                <ContextMenuItem onMouseDown={() => onDelete(index)}>
                    <Trash2Icon className="h-6 w-6" />
                    Delete
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    )
}
