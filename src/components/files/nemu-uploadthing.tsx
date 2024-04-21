'use client'

import { DndContext, DragOverlay } from '@dnd-kit/core'
import { SortableContext } from '@dnd-kit/sortable'

import { useUploadThingContext } from '~/components/files/uploadthing-context'

import NemuUploadDropzone from '~/components/files/nemu-dropzone'
import NemuUploadPreview from '~/components/files/nemu-upload-preview'
import NemuUploadProgress from '~/components/files/nemu-upload-progress'

export default function NemuUploadThing() {
    const { filePreviews } = useUploadThingContext()

    return (
        <div className="flex flex-col gap-5">
            <NemuUploadProgress />
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
