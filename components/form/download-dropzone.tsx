'use client'

import { NemuResponse, StatusCode } from '@/core/responses'
import {
    AWSFileModification,
    AWSLocationEnumToString,
    AWSLocations,
    AWSModification
} from '@/core/structures'
import { Transition } from '@headlessui/react'
import { PhotoIcon, QuestionMarkCircleIcon } from '@heroicons/react/20/solid'
import { InputHTMLAttributes, forwardRef, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { BsFileZipFill } from 'react-icons/bs'
import { toast } from 'react-toastify'
import { useDashboardContext } from '../navigation/dashboard/dashboard-context'
import { api } from '@/core/trpc/react'

interface Props extends InputHTMLAttributes<HTMLInputElement> {
    form_submission_id: string
    commission_id: string
    user_id: string
    uploaded?: boolean
    receipt_url: string
}

const DownloadDropzone = forwardRef<HTMLInputElement, Props>(
    (
        { form_submission_id, commission_id, user_id, receipt_url, uploaded, ...props },
        ref
    ) => {
        const { artist } = useDashboardContext()!
        const [file, setFile] = useState<AWSFileModification>()
        const [disabled, setDisabled] = useState(uploaded)
        const mutation = api.user.set_download.useMutation()

        const { acceptedFiles, getRootProps, getInputProps } = useDropzone({
            maxFiles: 1,
            accept: {
                'application/zip': [],
                'image/*': [],
                'video/*': []
            },
            onDrop: (acceptedFiles) => {
                const last_dot = acceptedFiles[0].name.lastIndexOf('.')
                const file_extension = acceptedFiles[0].name.substring(
                    last_dot,
                    acceptedFiles[0].name.length
                )
                const file_key = crypto.randomUUID() + file_extension

                setFile({
                    aws_location: AWSLocations.Downloads,
                    file_key: file_key,
                    updated_file: acceptedFiles[0],
                    modification: AWSModification.Added
                })

                setDisabled(true)

                const toast_id = toast.loading('Uploading File', { theme: 'dark' })

                // Upload Files to S3
                const awsData = new FormData()
                awsData.append('file', acceptedFiles[0])

                fetch(`/api/aws/${artist.id!}/downloads/${file_key}`, {
                    method: 'post',
                    body: awsData
                })
                    .then((response) => response.json())
                    .then((json: NemuResponse) => {
                        if (json.status != StatusCode.Success) {
                            toast.update(toast_id, {
                                render: 'File could not be uploaded',
                                autoClose: 5000,
                                type: 'error',
                                theme: 'dark',
                                isLoading: false
                            })

                            return
                        }

                        // Update Database
                        mutation
                            .mutateAsync({
                                artist_id: artist.id!,
                                user_id,
                                form_submission_id,
                                commission_id,
                                file_key,
                                receipt_url
                            })
                            .then((res) => {
                                if (!res.success) {
                                    toast.update(toast_id, {
                                        render: 'Error Saving File to Database',
                                        autoClose: 5000,
                                        type: 'error',
                                        isLoading: false
                                    })

                                    return
                                }

                                toast.update(toast_id, {
                                    render: 'File Uploaded',
                                    autoClose: 5000,
                                    type: 'success',
                                    isLoading: false
                                })
                            })
                    })
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
                    <input
                        ref={ref}
                        type="file"
                        {...props}
                        {...getInputProps()}
                        disabled={disabled}
                    />
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
                            {GetFileTypeIcon(
                                acceptedFiles.length != 0
                                    ? acceptedFiles[0].type
                                    : undefined
                            )}
                            <h2 className="card-title">
                                {acceptedFiles.length != 0 ? acceptedFiles[0].name : ''}
                            </h2>
                        </div>
                    </div>
                </Transition>
            </div>
        )
    }
)

export default DownloadDropzone
