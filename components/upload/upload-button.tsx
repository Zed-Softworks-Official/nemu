'use client'

import {
    AWSMimeType,
    AWSEndpoint,
    UploadResponse,
    FileUploadData,
    AWSAction,
    UploadError,
    UploadProps
} from '@/core/structures'
import { useUploadContext } from './upload-context'
import { useRef, useState } from 'react'
import axios from 'axios'

import { toast } from 'react-toastify'

export default function UploadButton(props: UploadProps) {
    const [uploading, setUploading] = useState(false)

    const inputRef = useRef<HTMLInputElement>(null)

    return (
        <div className="flex flex-col gap-5 justify-center items-center border-2 border-dashed border-opacity-50 border-base-content border-spacing-28 rounded-xl p-5 w-fit">
            <input
                ref={inputRef}
                type="file"
                name="files"
                className="hidden"
                accept={props.accept.join(',')}
                multiple={
                    props.max_files !== undefined || props.max_files! > 1 ? true : false
                }
                onChange={async (e) => {
                    if (!e.currentTarget.files) return

                    setUploading(true)

                    const awsData = new FormData()
                    for (const file of e.currentTarget.files) {
                        if (file.size / 1024 / 1024 > 4) {
                            toast('File exceeds upload limit!', {
                                theme: 'dark',
                                type: 'error'
                            })

                            return
                        }

                        // Generate Metadata
                        const file_metadata: FileUploadData = {
                            key: crypto.randomUUID(),
                            aws_data: {
                                uploaded_by: props.uploaded_by,
                                endpoint: props.endpoint,
                                action: props.action ? props.action : AWSAction.Upload
                            }
                        }

                        // Append data
                        awsData.append('files', file, file_metadata.key)
                        awsData.append(file_metadata.key, JSON.stringify(file_metadata))
                    }

                    const res = await axios.post('/api/aws', awsData)

                    // Handle Success Event
                    if (props.on_success && res.status == 200) {
                        props.on_success(res.data)
                    }

                    // Handle Error Event
                    if (props.on_error && res.status != 200) {
                        props.on_error(res.data)
                    }

                    setUploading(false)
                }}
            />
            <button
                type="button"
                className="btn btn-primary btn-wide"
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
            >
                {uploading ? <span className="loading loading-spinner"></span> : 'Upload'}
            </button>
            <span className="text-base-content/80 italic">Max File Size: 4MB</span>
        </div>
    )
}
