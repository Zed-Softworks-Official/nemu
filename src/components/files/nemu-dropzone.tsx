'use client'

import { useCallback } from 'react'
import { useDropzone } from '@uploadthing/react'
import { generateClientDropzoneAccept } from 'uploadthing/client'

import { useUploadThingContext } from '~/components/files/uploadthing-context'
import { UploadCloudIcon } from 'lucide-react'
import { cn } from '~/lib/utils'
import { ImageEditorData } from '~/core/structures'
import { toast } from 'sonner'

export default function NemuUploadDropzone({
    className,
    setCurrentImages
}: {
    className?: string
    setCurrentImages: (currentImages: ImageEditorData[]) => void
}) {
    const { images, setImages, fileTypes } = useUploadThingContext()

    const onDrop = useCallback((acceptedFiles: File[]) => {
        // Check if we have too many images
        if (images.length + acceptedFiles.length > 6) {
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

        setImages(formattedData)
        setCurrentImages(formattedData)
    }, [])

    const { getRootProps, getInputProps } = useDropzone({
        onDrop,
        accept: fileTypes ? generateClientDropzoneAccept(fileTypes) : undefined
    })

    return (
        <div
            {...getRootProps()}
            className={cn(
                'mx-auto flex w-full border-spacing-28 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-base-content border-opacity-50 bg-base-100 p-10 transition-all duration-200 ease-in-out hover:border-primary focus:border-primary',
                className
            )}
        >
            <input {...getInputProps()} className="hidden" />

            <UploadCloudIcon className="h-10 w-10" />
            <span className="text-md">Choose file or Drag and Drop</span>
            <span className="-mt-3 text-sm italic text-base-content/60">{fileTypes}</span>

            <button type="button" className="btn btn-primary mt-5 text-base-content">
                Choose File
            </button>
        </div>
    )
}
