'use client'

import Image from 'next/image'

import { useEffect, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { useFormContext } from './form-context'

export default function FormDropzone({ label, name = 'dropzone-file' }: { label: string, name?: string }) {
    const [filePreview, setfilePreview] = useState('')
    const { setImage } = useFormContext()
    const { acceptedFiles, getRootProps, getInputProps } = useDropzone({
        maxFiles: 1,
        accept: {
            'image/*': []
        },
        onDrop: (acceptedFiles) => {
            setfilePreview(URL.createObjectURL(acceptedFiles[0]))
            setImage!(acceptedFiles[0])
        }
    })

    const thumbs = (
        <div className="inline-flex border-2 border-solid border-white mb-8 mr-8 w-full h-full box-border">
            <div className="flex min-w-0 overflow-hidden">
                <Image className="block w-auto h-full" width={500} height={500} alt="Image Preview" src={filePreview} />
            </div>
        </div>
    )

    useEffect(() => {
        return () => URL.revokeObjectURL(filePreview)
    }, [])

    return (
        <div className="mb-5">
            <label className="block mb-5">{label}:</label>
            <div
                className="mx-auto p-10 border-dashed border-white border-opacity-50 border-4 rounded-xl focus:border-primary bg-charcoal text-center border-spacing-28"
                {...getRootProps()}
            >
                <input name={name} type="file" {...getInputProps()} />
                <p>Drag a file to upload!</p>
            </div>

            {filePreview && (
                <aside className="flex flex-col flex-wrap mt-16">
                    <label className="block mb-5">Preview: </label>
                    {thumbs}
                </aside>
            )}
        </div>
    )
}