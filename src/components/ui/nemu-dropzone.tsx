'use client'

import { useCallback, useEffect, useState } from 'react'
import { useDropzone } from '@uploadthing/react'
import { generateClientDropzoneAccept } from 'uploadthing/client'

import { useUploadThing } from '~/components/uploadthing'
import { type FileRouter } from 'uploadthing/types'
import { NemuFileRouterType } from '~/app/api/uploadthing/core'
import Container from './container'

export type EndpointHelper<TRouter extends void | FileRouter> = void extends TRouter
    ? 'YOU FORGOT TO PASS THE GENERIC'
    : keyof TRouter

export default function NemuUploadDropzone({
    endpoint
}: {
    endpoint: EndpointHelper<NemuFileRouterType>
}) {
    const [files, setFiles] = useState<File[]>([])
    const [filePreviews, setFilePreviews] = useState<string[]>([])

    const onDrop = useCallback((acceptedFiles: File[]) => {
        setFiles(acceptedFiles)
        setFilePreviews(acceptedFiles.map((file) => URL.createObjectURL(file)))
    }, [])

    const { startUpload, permittedFileInfo } = useUploadThing('portfolioUploader', {
        onClientUploadComplete: (res) => {

        }
    })

    const fileTypes = permittedFileInfo?.config
        ? Object.keys(permittedFileInfo?.config)
        : []

    const { getRootProps, getInputProps } = useDropzone({
        onDrop,
        accept: fileTypes ? generateClientDropzoneAccept(fileTypes) : undefined
    })

    useEffect(() => {
        return () => {
            for (const preview of filePreviews) {
                URL.revokeObjectURL(preview)
            }
        }
    }, [filePreviews])

    return (
        <div
            {...getRootProps()}
            className="mx-auto p-10 border-dashed border-base-content border-opacity-50 border-2 rounded-xl focus:border-primary bg-base-100 text-center border-spacing-28 w-full"
        >
            <input {...getInputProps()} className="hidden" />
            Drop files here!
        </div>
    )
}
