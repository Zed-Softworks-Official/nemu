'use client'

import * as z from 'zod'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { User } from '@prisma/client'

import TextField from '../form/text-input'
import ProfilePhotoDropzone from '../form/profile-photo-dropzone'
import { api } from '@/core/api/react'
import { Id, toast } from 'react-toastify'
import { useState } from 'react'
import UploadButton from '../upload/upload-button'
import { AWSMimeType, AWSEndpoint } from '@/core/structures'
import UploadProvider from '../upload/upload-context'
import { CloudUpload } from 'lucide-react'
import NemuImage from '../nemu-image'

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
    const [toastId, setToastId] = useState<Id | undefined>(undefined)
    const [profilePhoto, setProfilePhoto] = useState(user.image)
    const form = useForm<AccountSchemaType>({
        resolver: zodResolver(accountSchema),
        mode: 'onSubmit',
        defaultValues: {
            username: user.name || undefined,
            email: user.email || undefined
        }
    })

    const mutation = api.user.update_user.useMutation({
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

    async function ProcessForm(values: AccountSchemaType) {
        if (mutation.isPending) return

        const toast_id = toast.loading('Updating Account', { theme: 'dark' })
        setToastId(toast_id)
        
        mutation.mutate(values)
    }

    return (
        <form className="flex flex-col gap-5" onSubmit={form.handleSubmit(ProcessForm)}>
            <div className="flex flex-col gap-5">
                <label className="label">Profile Photo:</label>
                <div className="flex gap-5 w-full">
                    <div className="form-control">
                        <div className="flex gap-5 w-full">
                            <NemuImage
                                src={profilePhoto!}
                                alt="Profile Image"
                                width={200}
                                height={200}
                                className="avatar rounded-full w-16 h-16"
                            />
                        </div>
                    </div>
                    <UploadButton
                        accept={[AWSMimeType.Image]}
                        endpoint={AWSEndpoint.Profile}
                        uploaded_by={user.id}
                        onSuccess={(res) => {
                            toast('Profile Photo Updated!', {
                                theme: 'dark',
                                type: 'success'
                            })
                        }}
                        onError={(res) => {
                            toast(res.message, { theme: 'dark', type: 'error' })
                        }}
                    />
                    {/* <div className="flex flex-col gap-5 w-full">
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
                            <CloudUpload className="w-full h-6 items-center justify-center flex" />
                            <p>Drag a file to upload!</p>
                        </div>
                    </div> */}
                </div>
            </div>

            {/* <ProfilePhotoDropzone
                initialPhoto={user.image || '/profile.png'}
                id={user.id}
            /> */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <TextField
                    label="Username"
                    {...form.register('username')}
                    containerClassnames="w-full"
                    placeholder="Username"
                    disabled={mutation.isPending}
                />
                <TextField
                    label="Email"
                    {...form.register('email')}
                    containerClassnames="w-full"
                    error={form.formState.errors.email ? true : false}
                    errorMessage={form.formState.errors.email?.message}
                    placeholder="Email Address"
                    disabled={mutation.isPending}
                />
            </div>
        </form>
    )
}
