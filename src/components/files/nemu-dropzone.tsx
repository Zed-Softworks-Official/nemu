'use client'

import { useCallback } from 'react'
import { useDropzone } from '@uploadthing/react'
import { generateClientDropzoneAccept } from 'uploadthing/client'

import { useUploadThingContext } from '~/components/files/uploadthing-context'
import { UploadCloudIcon } from 'lucide-react'

export default function NemuUploadDropzone() {
    const { setFiles, setFilePreviews, fileTypes } = useUploadThingContext()

    const onDrop = useCallback((acceptedFiles: File[]) => {
        setFiles(acceptedFiles)
        setFilePreviews(acceptedFiles.map((file) => URL.createObjectURL(file)))
    }, [])

    const { getRootProps, getInputProps } = useDropzone({
        onDrop,
        accept: fileTypes ? generateClientDropzoneAccept(fileTypes) : undefined
    })

    return (
        <div
            {...getRootProps()}
            className="mx-auto p-10 border-dashed border-base-content border-opacity-50 border-2 rounded-xl focus:border-primary bg-base-100 border-spacing-28 w-full flex flex-col justify-center items-center gap-3 transition-all duration-200 ease-in-out hover:border-primary cursor-pointer"
        >
            <input {...getInputProps()} className="hidden" />

            <UploadCloudIcon className="w-10 h-10" />
            <p>Choose file or Drag and Drop</p>

            <button type="button" className="btn btn-primary text-base-content mt-5">
                Choose File
            </button>
        </div>
    )
}
