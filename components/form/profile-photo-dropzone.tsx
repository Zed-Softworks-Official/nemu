'use client'

import { forwardRef, InputHTMLAttributes, useEffect, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import NemuImage from '../nemu-image'
import { AWSLocationEnumToString, AWSLocations } from '@/core/structures'
import { Id, toast } from 'react-toastify'
import { useMutation } from '@tanstack/react-query'
import axios from 'axios'
import { api } from '@/core/trpc/react'
import { FileResponse } from '@/core/responses'
import { CloudUploadIcon } from 'lucide-react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    initialPhoto: string
    id: string
}

const ProfilePhotoDropzone = forwardRef<HTMLInputElement, InputProps>(
    ({ initialPhoto, id, ...props }, ref) => {
        const [toastId, setToastId] = useState<Id | undefined>(undefined)
        const [filePreview, setFilePreview] = useState(initialPhoto)

        const userMutation = api.user.set_profile_photo.useMutation({
            onSuccess: () => {
                toast.update(toastId!, {
                    render: 'Profile image uploaded!',
                    isLoading: false,
                    autoClose: 5000,
                    type: 'success',
                    theme: 'dark'
                })

                setFilePreview(URL.createObjectURL(acceptedFiles[0]))
            }
        })

        const fileMutation = useMutation({
            mutationFn: (awsData: FormData) => {
                return axios.post(
                    `/api/aws/${id}/${AWSLocationEnumToString(AWSLocations.Profile)}/${crypto.randomUUID()}`,
                    awsData
                )
            },
            onSuccess: ({ data }) => {
                userMutation.mutate((data as FileResponse).file_key)
            }
        })

        const { acceptedFiles, getRootProps, getInputProps } = useDropzone({
            maxFiles: 1,
            accept: {
                'image/*': []
            },
            onDrop: (acceptedFiles) => {
                const formData = new FormData()
                formData.append('file', acceptedFiles[0])

                const toast_id = toast.loading('Uploading new profile image!', {
                    theme: 'dark'
                })

                setToastId(toast_id)
                fileMutation.mutate(formData)
            }
        })

        useEffect(() => {
            return URL.revokeObjectURL(filePreview)
        })

        return (
            <div className="flex flex-col gap-5">
                <label className="label">Profile Photo:</label>
                <div className="flex gap-5 w-full">
                    <div className="form-control">
                        <div className="flex gap-5 w-full">
                            <NemuImage
                                src={filePreview}
                                alt="Profile Image"
                                width={200}
                                height={200}
                                className="avatar rounded-full w-16 h-16"
                            />
                        </div>
                    </div>
                    <div className="flex flex-col gap-5 w-full">
                        <div
                            className="mx-auto p-10 border-dashed border-base-content border-opacity-50 border-2 rounded-xl focus:border-primary bg-base-100 text-center border-spacing-28 w-full hover:border-primary hover:cursor-pointer"
                            {...getRootProps()}
                        >
                            <input
                                ref={ref}
                                type="file"
                                {...props}
                                {...getInputProps()}
                            />
                            <CloudUploadIcon className=" items-center justify-center flex w-full" />
                            <p>Drag a file to upload!</p>
                        </div>
                    </div>
                </div>
            </div>
        )
    }
)

export default ProfilePhotoDropzone
