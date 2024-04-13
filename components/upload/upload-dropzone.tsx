'use client'

import { UploadCloudIcon } from 'lucide-react'
import { useEffect } from 'react'
import { Accept, useDropzone } from 'react-dropzone'

import {
    AWSAction,
    AWSMimeType,
    FileUploadData,
    UploadProps,
    UploadResponse
} from '@/core/structures'
import { GenerateAWSData, useUploadContext } from '@/components/upload/upload-context'
import { cn } from '@/lib/utils'
import { useMutation } from '@tanstack/react-query'
import axios from 'axios'

function convertAWSMimeTypeToDropzoneMimeType(mimetypes: AWSMimeType[]) {
    let result: Accept = {}

    for (const mimetype of mimetypes) {
        switch (mimetype) {
            case AWSMimeType.Image:
                {
                    const values = AWSMimeType.Image.replaceAll('image/', '.').split(',')
                    result['image/*'] = values
                }
                break
            case AWSMimeType.Video:
                {
                    const values = AWSMimeType.Video.replaceAll('video/', '.').split(',')
                    result['video/*'] = values
                }
                break
            case AWSMimeType.Zip:
                {
                    const values = AWSMimeType.Zip.replaceAll('application/', '.').split(
                        ','
                    )
                    result['application/zip'] = values
                }
                break
        }
    }

    return result
}

export default function UploadDropzone(props: UploadProps) {
   

    const { filePreviews, setFilePreviews, setFiles, files, uploadMutation } = useUploadContext()!

    const { getRootProps, getInputProps, inputRef } = useDropzone({
        maxFiles: props.max_files,
        disabled: uploadMutation.isPending,
        accept: convertAWSMimeTypeToDropzoneMimeType(props.accept),
        onDrop: (acceptedFiles) => {
            // Reset files just in case
            setFiles(null)

            const previewStrings: string[] = []
            for (const file of acceptedFiles) {
                // Add Previews for file
                previewStrings.push(URL.createObjectURL(file))

                // Add files to context
                const fileUploadData: FileUploadData = {
                    aws_data: {
                        uploaded_by: props.uploaded_by,
                        action: props.action ? props.action : AWSAction.Upload,
                        endpoint: props.endpoint
                    },
                    key: crypto.randomUUID(),
                    file: file
                }

                if (files) {
                    setFiles([...files, fileUploadData])
                } else {
                    setFiles([fileUploadData])
                }
            }

            setFilePreviews(previewStrings)

            if (props.auto_upload) {
                uploadMutation.mutate(
                    GenerateAWSData(acceptedFiles, {
                        uploaded_by: props.uploaded_by,
                        endpoint: props.endpoint,
                        action: props.action ? props.action : AWSAction.Upload
                    })
                )
            }
        }
    })

    useEffect(() => {
        return () => {
            if (!filePreviews) return

            for (const filePreview of filePreviews) {
                URL.revokeObjectURL(filePreview)
            }
        }
    }, [filePreviews])

    return (
        <div className={cn('flex flex-col gap-5', props.containerClassnames)}>
            <div
                className="mx-auto p-10 border-dashed border-base-content border-opacity-50 border-2 rounded-xl focus:border-primary bg-base-100 text-center border-spacing-28 w-full cursor-pointer hover:border-primary transition-all duration-150 flex flex-col gap-5 justify-center items-center"
                {...getRootProps()}
            >
                <UploadCloudIcon className="w-8 h-8" />
                <input ref={inputRef} type="file" {...getInputProps()} />
                <p>Drag a file to upload!</p>
            </div>
        </div>
    )
}
