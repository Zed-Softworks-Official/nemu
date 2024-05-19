'use client'

import { useState } from 'react'

import {
    DndContext,
    DragEndEvent,
    DragOverlay,
    DragStartEvent,
    PointerSensor,
    useSensor,
    useSensors
} from '@dnd-kit/core'
import { arrayMove, SortableContext } from '@dnd-kit/sortable'

import { useUploadThingContext } from '~/components/files/uploadthing-context'

import NemuUploadDropzone from '~/components/files/nemu-dropzone'
import NemuUploadPreview from '~/components/files/nemu-upload-preview'
import NemuUploadProgress from '~/components/files/nemu-upload-progress'
import NemuPreviewItem from '~/components/files/nemu-preview-item'
import { ImageEditorData } from '~/core/structures'

export default function NemuUploadThing() {
    const { images, setImages } = useUploadThingContext()

    const [activeFile, setActiveFile] = useState<ImageEditorData | null>(null)
    const [currentImages, setCurrentImages] = useState<ImageEditorData[]>(images)

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 3
            }
        })
    )

    function OnDelete(index: number) {
        if (currentImages.length !== 0) {
            setCurrentImages((prev) => {
                prev[index]!.data.action = 'delete'
                return prev
            })
        }
    }

    function OnDragStart(event: DragStartEvent) {
        setActiveFile(event.active.data.current?.preview)
    }

    function OnDragEnd(event: DragEndEvent) {
        setActiveFile(null)

        const { active, over } = event

        if (!over) return

        const activeId = active.id
        const overId = over.id

        if (activeId === overId) return

        const activeIndex = currentImages.findIndex((preview) => preview.id === activeId)
        const overIndex = currentImages.findIndex((preview) => preview.id === overId)

        const new_images = arrayMove(currentImages, activeIndex, overIndex)

        setCurrentImages(new_images)
        setImages(new_images)
    }

    return (
        <div className="flex flex-col gap-5">
            <NemuUploadProgress />
            <NemuUploadDropzone setCurrentImages={setCurrentImages} />

            <DndContext onDragStart={OnDragStart} onDragEnd={OnDragEnd} sensors={sensors}>
                <SortableContext items={currentImages}>
                    <NemuUploadPreview images={currentImages} onDelete={OnDelete} />
                </SortableContext>
                <DragOverlay>
                    {activeFile && (
                        <NemuPreviewItem
                            onDelete={OnDelete}
                            preview={activeFile}
                            index={0}
                        />
                    )}
                </DragOverlay>
            </DndContext>
        </div>
    )
}
