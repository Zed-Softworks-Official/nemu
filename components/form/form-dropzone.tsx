'use client'

import { ForwardedRef, InputHTMLAttributes, forwardRef, useEffect, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { useFormContext } from './form-context'
import NemuImage from '../nemu-image'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    label: string
}

const FormDropzone = forwardRef<HTMLInputElement, InputProps>(
    ({ label, ...props }, ref) => {
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
            <div className="card bg-base-100 shadow-xl">
                <div className="card-body">
                    <figure>
                        <NemuImage
                            className="block w-auto h-full"
                            width={500}
                            height={500}
                            alt="Image Preview"
                            src={filePreview}
                        />
                    </figure>
                </div>
            </div>
        )

        useEffect(() => {
            return () => URL.revokeObjectURL(filePreview)
        }, [filePreview])

        return (
            <div className="flex flex-col gap-5">
                <div className="form-control">
                    <label className="label">{label}:</label>
                    <div
                        className="mx-auto p-10 border-dashed border-base-content border-opacity-50 border-4 rounded-xl focus:border-primary bg-base-100 text-center border-spacing-28 w-full"
                        {...getRootProps()}
                    >
                        <input ref={ref} type="file" {...props} {...getInputProps()} />
                        <p>Drag a file to upload!</p>
                    </div>
                </div>

                {filePreview && (
                    <aside className="form-control">
                        <label className="label">Preview: </label>
                        {thumbs}
                    </aside>
                )}
            </div>
        )
    }
)

export default FormDropzone
