'use client'

import { DndContext, DragOverlay } from '@dnd-kit/core'
import { SortableContext } from '@dnd-kit/sortable'

import NemuUploadDropzone from '~/components/files/nemu-dropzone'
import NemuUploadPreview from '~/components/files/nemu-upload-preview'
import { useUploadThingContext } from '~/components/files/uploadthing-context'

export default function NemuUploadThing() {
    const { filePreviews } = useUploadThingContext()

    return (
        <div className="flex flex-col gap-5 join">
            <NemuUploadDropzone />
            <DndContext>
                <SortableContext items={filePreviews}>
                    <NemuUploadPreview />
                </SortableContext>
                <DragOverlay>
                    <>Hello, World!</>
                </DragOverlay>
            </DndContext>
        </div>
    )
}
