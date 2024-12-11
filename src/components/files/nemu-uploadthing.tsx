'use client'

import { useCallback, useState } from 'react'

import {
    DndContext,
    type DragEndEvent,
    DragOverlay,
    type DragStartEvent,
    PointerSensor,
    useDroppable,
    useSensor,
    useSensors
} from '@dnd-kit/core'
import { arrayMove, SortableContext, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Trash2Icon, UploadCloudIcon } from 'lucide-react'
import { generateClientDropzoneAccept } from 'uploadthing/client'
import { useDropzone } from '@uploadthing/react'

import { useNemuUploadThing } from '~/components/files/uploadthing-context'

import type { ImageEditorData } from '~/lib/structures'

import { Progress } from '~/components/ui/progress'
import { toast } from 'sonner'
import { cn } from '~/lib/utils'

import NemuImage from '~/components/nemu-image'
import {
    ContextMenu,
    ContextMenuItem,
    ContextMenuContent,
    ContextMenuTrigger
} from '~/components/ui/context-menu'
import { Button } from '../ui/button'
import Image from 'next/image'

export default function NemuUploadThing() {
    const { images, setImages } = useNemuUploadThing()

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
                const newImages = [...prev]
                newImages[index]!.data.action = 'delete'
                return newImages
            })
        }
    }

    function OnDragStart(event: DragStartEvent) {
        setActiveFile(event.active.data.current?.preview as ImageEditorData | null)
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

function NemuUploadProgress() {
    const { uploadProgress, isUploading } = useNemuUploadThing()

    if (!isUploading) return null

    return <Progress value={uploadProgress} />
}

function NemuUploadDropzone(props: {
    className?: string
    limit?: number
    setCurrentImages: (currentImages: ImageEditorData[]) => void
}) {
    const { images, setImages, fileTypes } = useNemuUploadThing()

    const onDrop = useCallback(
        (acceptedFiles: File[]) => {
            // Check if we have too many images
            const limit = props.limit ?? 6

            if (images.length + acceptedFiles.length > limit) {
                toast.error('Too many images!')
                return
            }

            const formattedData: ImageEditorData[] = acceptedFiles.map((file) => ({
                id: crypto.randomUUID(),
                data: {
                    action: 'create',
                    image_data: {
                        url: URL.createObjectURL(file),
                        file_data: file
                    }
                }
            }))

            props.setCurrentImages(formattedData)
            setImages(formattedData)
        },
        [props, setImages, images]
    )

    const { getRootProps, getInputProps } = useDropzone({
        onDrop,
        accept: generateClientDropzoneAccept(fileTypes)
    })

    return (
        <div
            {...getRootProps()}
            className={cn(
                'border-base-content mx-auto flex w-full border-spacing-28 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-opacity-50 bg-background-secondary p-10 transition-all duration-200 ease-in-out hover:border-primary focus:border-primary',
                props.className
            )}
        >
            <input {...getInputProps()} className="hidden" />

            <UploadCloudIcon className="h-10 w-10" />
            <span className="text-md">Choose file or Drag and Drop</span>
            <span className="text-base-content/60 -mt-3 text-sm italic">{fileTypes}</span>

            <Button type="button">Choose File</Button>
        </div>
    )
}

function NemuUploadPreview(props: {
    className?: string
    onDelete: (index: number) => void
    images: ImageEditorData[]
}) {
    const { setNodeRef } = useDroppable({
        id: 'nemu-upload-preview'
    })

    if (props.images.length === 0) {
        return null
    }

    if (props.images.length === 1) {
        return (
            <div className={cn('bg-background-secondary shadow-xl', props.className)}>
                <figure>
                    <NemuImage
                        src={
                            props.images[0]?.data.image_data.url ??
                            '/nemu/not-like-this.png'
                        }
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
                'flex flex-col gap-5 rounded-xl bg-background-secondary p-5 shadow-xl',
                props.className
            )}
        >
            <div className="flex flex-row gap-5" ref={setNodeRef}>
                {props.images.map(
                    (preview, i) =>
                        preview.data.action !== 'delete' && (
                            <NemuPreviewItem
                                onDelete={props.onDelete}
                                key={preview.data.image_data.url}
                                preview={preview}
                                index={i}
                            />
                        )
                )}
            </div>
            <span className="text-base-content/60 italic">
                Note: The first image will be the featured image or cover image
            </span>
        </div>
    )
}

function NemuPreviewItem(props: {
    preview: ImageEditorData
    onDelete: (index: number) => void
    index: number
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
        useSortable({
            id: props.preview.id,
            data: {
                preview: props.preview
            }
        })

    const style = {
        transition,
        transform: CSS.Transform.toString(transform)
    }

    if (!props.preview) {
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
                        src={
                            props.preview.data.image_data.url ?? '/nemu/not-like-this.png'
                        }
                        alt="Image Preview"
                        className="h-fit w-full rounded-xl"
                        width={200}
                        height={200}
                    />
                </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
                <ContextMenuItem onClick={() => props.onDelete(props.index)}>
                    <Trash2Icon className="mr-2 h-4 w-4" />
                    Delete
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    )
}

export function NemuSingleDropzone() {
    const { images, setImages } = useNemuUploadThing()

    return (
        <div className="flex flex-col gap-5">
            <NemuUploadProgress />
            <NemuUploadDropzone setCurrentImages={setImages} limit={1} />
            {images.length > 0 && (
                <div className="flex h-full w-full">
                    <NemuImage
                        src={images[0]?.data.image_data.url ?? '/profile.png'}
                        alt="Image Preview"
                        width={200}
                        height={200}
                        className="h-full w-full rounded-xl"
                    />
                </div>
            )}
        </div>
    )
}
