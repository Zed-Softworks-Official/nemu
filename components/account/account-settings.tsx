'use client'

import * as z from 'zod'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { User } from '@prisma/client'

import TextField from '../form/text-input'
import ProfilePhotoDropzone from '../form/profile-photo-dropzone'
import { api } from '@/core/trpc/react'
import { Id, toast } from 'react-toastify'
import { useState } from 'react'

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
    const form = useForm<AccountSchemaType>({
        resolver: zodResolver(accountSchema),
        mode: 'onBlur',
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
        <form className="flex flex-col gap-5" onBlur={form.handleSubmit(ProcessForm)}>
            <ProfilePhotoDropzone
                initialPhoto={user.image || '/profile.png'}
                id={artist_id ? artist_id : user.id}
            />
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
