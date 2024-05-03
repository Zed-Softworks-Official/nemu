'use client'

import { useState } from 'react'

import { DndContext, DragEndEvent, DragOverlay, DragStartEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext } from '@dnd-kit/sortable'

import { useUploadThingContext } from '~/components/files/uploadthing-context'

import NemuUploadDropzone from '~/components/files/nemu-dropzone'
import NemuUploadPreview from '~/components/files/nemu-upload-preview'
import NemuUploadProgress from '~/components/files/nemu-upload-progress'
import NemuPreviewItem from './nemu-preview-item'

export default function NemuUploadThing() {
    const { filePreviews, setFilePreviews } = useUploadThingContext()

    const [activeFile, setActiveFile] = useState<string | null>(null)

    function OnDragStart(event: DragStartEvent) {
        setActiveFile(event.active.data.current?.preview)
    }

    function OnDragEnd(event: DragEndEvent) {
        setActiveFile(null)

        const { active, over } = event

        if (!over) return

        const activePreview = active.data.current?.preview
        const overPreivew = over.data.current?.preview

        if (activePreview === overPreivew) return

        setFilePreviews((prev) => {
            const activeIndex = prev.findIndex((preview) => preview === activePreview)
            const overIndex = prev.findIndex((preview) => preview === overPreivew)

            return arrayMove(prev, activeIndex, overIndex)
        })
    }

    return (
        <div className="flex flex-col gap-5">
            <NemuUploadProgress />
            <NemuUploadDropzone />
            <DndContext onDragStart={OnDragStart}>
                <SortableContext items={filePreviews}>
                    <NemuUploadPreview />
                </SortableContext>
                <DragOverlay>
                    <NemuPreviewItem preview={activeFile} i={0} />
                </DragOverlay>
            </DndContext>
        </div>
    )
}
