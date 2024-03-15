'use client'

import { AWSFileModification, AWSLocations, AWSModification } from '@/core/structures'
import { Transition } from '@headlessui/react'
import { PhotoIcon, QuestionMarkCircleIcon } from '@heroicons/react/20/solid'
import { InputHTMLAttributes, forwardRef, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { BsFileZipFill } from 'react-icons/bs'

const DownloadDropzone = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ ...props }, ref) => {
    const [file, setFile] = useState<AWSFileModification>()

    const { acceptedFiles, getRootProps, getInputProps } = useDropzone({
        maxFiles: 1,
        accept: {
            'application/zip': [],
            'image/*': [],
            'video/*': []
        },
        onDrop: (acceptedFiles) => {
            setFile({
                aws_location: AWSLocations.Downloads,
                file_key: crypto.randomUUID(),
                updated_file: acceptedFiles[0],
                modification: AWSModification.Added
            })

            // Upload Files to S3
        }
    })

    function GetFileTypeIcon(filetype?: string) {
        if (!filetype) return null

        if (filetype.includes('zip')) {
            return <BsFileZipFill className="w-10 h-10" />
        }

        if (filetype.includes('image')) {
            return <PhotoIcon className="w-10 h-10" />
        }

        return <QuestionMarkCircleIcon className="w-10 h-10" />
    }

    return (
        <div className="flex flex-col gap-5 h-full">
            <div
                className="mx-auto p-10 border-dashed border-base-content border-opacity-50 border-2 rounded-xl focus:border-primary bg-base-100 text-center border-spacing-28 w-full h-full hover:border-primary hover:cursor-pointer flex justify-center items-center transition-all duration-200 ease-in-out"
                {...getRootProps()}
            >
                <input ref={ref} type="file" {...props} {...getInputProps()} />
                <p>Drag a file to upload!</p>
            </div>

            <Transition
                show={acceptedFiles.length != 0}
                enter="transition-all duration-200 ease-in-out"
                enterFrom="opacity-0 scale-0"
                enterTo="opacity-100 scale-100"
            >
                <div className="card bg-base-300 rounded-xl shadow-xl">
                    <div className="card-body flex-row">
                        {GetFileTypeIcon(acceptedFiles.length != 0 ? acceptedFiles[0].type : undefined)}
                        <h2 className="card-title">{acceptedFiles.length != 0 ? acceptedFiles[0].name : ''}</h2>
                    </div>
                </div>
            </Transition>
        </div>
    )
})

export default DownloadDropzone
