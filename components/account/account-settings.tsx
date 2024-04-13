'use client'

import * as z from 'zod'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { User } from '@prisma/client'

import TextField from '../form/text-input'
import { api } from '@/core/api/react'
import { Id, toast } from 'react-toastify'
import { useState } from 'react'
import { AWSMimeType, AWSEndpoint } from '@/core/structures'
import { useUploadContext } from '../upload/upload-context'
import NemuImage from '../nemu-image'
import UploadDropzone from '../upload/upload-dropzone'

const accountSchema = z.object({
    username: z.string().optional(),
    email: z.string().email('Must be a valid email address!').optional()
})

type AccountSchemaType = z.infer<typeof accountSchema>

export default function AccountSettings({
    user,
    artist_id
}: {
    user: User
    artist_id?: string
}) {
    const { filePreviews } = useUploadContext()!

    const [toastId, setToastId] = useState<Id | undefined>(undefined)
    const [profilePhoto, setProfilePhoto] = useState(user.image!)
    const form = useForm<AccountSchemaType>({
        resolver: zodResolver(accountSchema),
        mode: 'onSubmit',
        defaultValues: {
            username: user.name || undefined,
            email: user.email || undefined
        }
    })

    const userMutation = api.user.update_user.useMutation({
        onSuccess: () => {
            if (!toastId) return

            toast.update(toastId, {
                render: 'Account Updated!',
                autoClose: 5000,
                isLoading: false,
                type: 'success'
            })
        },
        onError: (e) => {
            if (!toastId) return

            toast.update(toastId, {
                render: e.message,
                autoClose: 5000,
                isLoading: false,
                type: 'error'
            })
        }
    })

    const profileMutation = api.user.set_profile_photo.useMutation({
        onSuccess: () => {

        },
        onError: () => {
            
        }
    })

    async function ProcessForm(values: AccountSchemaType) {
        if (userMutation.isPending) return

        const toast_id = toast.loading('Updating Account', { theme: 'dark' })
        setToastId(toast_id)

        userMutation.mutate(values)
    }

    return (
        <form className="flex flex-col gap-5" onSubmit={form.handleSubmit(ProcessForm)}>
            <div className="flex flex-col gap-5">
                <label className="label">Profile Photo:</label>
                <div className="flex gap-5 w-full">
                    <div className="form-control">
                        <div className="flex gap-5 w-full">
                            <NemuImage
                                src={profilePhoto}
                                alt="Profile Image"
                                width={200}
                                height={200}
                                className="avatar rounded-full w-16 h-16"
                            />
                        </div>
                    </div>
                    <UploadDropzone
                        accept={[AWSMimeType.Image]}
                        endpoint={AWSEndpoint.Profile}
                        uploaded_by={user.id}
                        max_files={1}
                        auto_upload
                        on_success={(res) => {
                            toast('Profile Photo Updated!', {
                                theme: 'dark',
                                type: 'success'
                            })

                            if (filePreviews) {
                                setProfilePhoto(filePreviews[0])
                            }
                        }}
                        on_error={(res) => {
                            toast(res.message, { theme: 'dark', type: 'error' })
                        }}
                        containerClassnames="w-full"
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <TextField
                    label="Username"
                    {...form.register('username')}
                    containerClassnames="w-full"
                    placeholder="Username"
                    disabled={userMutation.isPending}
                />
                <TextField
                    label="Email"
                    {...form.register('email')}
                    containerClassnames="w-full"
                    error={form.formState.errors.email ? true : false}
                    errorMessage={form.formState.errors.email?.message}
                    placeholder="Email Address"
                    disabled={userMutation.isPending}
                />
            </div>
        </form>
    )
}
