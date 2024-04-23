'use client'

import * as z from 'zod'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { SaveIcon, UserIcon } from 'lucide-react'

import { Form, FormField, FormItem, FormLabel } from '~/components/ui/form'
import { Input } from '~/components/ui/input'
import { Button } from '~/components/ui/button'
import { UploadDropzone } from '~/components/files/uploadthing'
import { Avatar, AvatarImage, AvatarFallback } from '~/components/ui/avatar'
import { useState } from 'react'
import { User } from '@prisma/client'
import { api } from '~/trpc/react'
import { useTheme } from 'next-themes'
import { nemu_toast } from '~/lib/utils'
import { Id } from 'react-toastify'

const accountSchema = z.object({
    username: z
        .string()
        .optional()
        .refine((value) => value !== '', 'Username must not be blank'),
    email: z
        .string()
        .email()
        .optional()
        .refine((value) => value !== '', 'Email must not be blank')
})

type AccountSchemaType = z.infer<typeof accountSchema>

export default function AccountSettings({ user }: { user: User }) {
    const [profilePhoto, setProfilePhoto] = useState(user.image || '/profile.png')
    const [toastId, setToastId] = useState<Id | null>(null)

    const { resolvedTheme } = useTheme()

    const mutation = api.user.update_user.useMutation({
        onMutate: () => {
            setToastId(nemu_toast.loading('Updating profile', { theme: resolvedTheme }))
        },
        onSuccess: () => {
            if (!toastId) return

            nemu_toast.update(toastId, {
                render: 'Profile updated',
                type: 'success',
                autoClose: 5000,
                isLoading: false
            })
        },
        onError: (e) => {
            if (!toastId) return

            nemu_toast.update(toastId, {
                render: e.message,
                type: 'error',
                autoClose: 5000,
                isLoading: false
            })
        }
    })

    const form = useForm<AccountSchemaType>({
        resolver: zodResolver(accountSchema),
        mode: 'onSubmit',
        defaultValues: {
            username: user.name ? user.name : undefined,
            email: user.email ? user.email : undefined
        }
    })

    function ProcessForm(values: AccountSchemaType) {
        mutation.mutate(values)
    }

    return (
        <Form {...form}>
            <form
                className="flex flex-col gap-5"
                onSubmit={form.handleSubmit(ProcessForm)}
            >
                <FormLabel className="label">Profile Photo:</FormLabel>
                <div className="flex gap-5">
                    <Avatar>
                        <AvatarImage src={profilePhoto} />
                        <AvatarFallback>
                            <UserIcon className="w-6 h-6" />
                        </AvatarFallback>
                    </Avatar>
                    <UploadDropzone
                        className="ut-ready:border-2 ut-ready:border-base-content/60 ut-ready:bg-base-100 ut-ready:hover:border-primary ut-label:text-base-content ut-allowed-content:text-base-content/80 ut-allowed-content:italic ut-button:bg-primary ut-button:active:scale-95 w-full ut-button:transition-all ut-button:duration-200 ut-button:ease-in-out ut-ready:transition-all ut-ready:duration-200 ut-ready:ease-in-out"
                        endpoint="profilePhotoUploader"
                        onClientUploadComplete={(res) => {
                            if (res[0]) {
                                setProfilePhoto(res[0].serverData.url)
                            }
                        }}
                    />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <FormField
                        control={form.control}
                        name="username"
                        render={({ field }) => (
                            <FormItem className="form-control">
                                <FormLabel className="label">Username:</FormLabel>
                                <Input placeholder="Username" {...field} />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                            <FormItem className="form-control">
                                <FormLabel className="label">Email:</FormLabel>
                                <Input placeholder="Email" {...field} />
                            </FormItem>
                        )}
                    />
                </div>
                <div className="flex justify-end">
                    <Button type="submit" className="btn-wide">
                        <SaveIcon className="w-6 h-6" />
                        Save
                    </Button>
                </div>
            </form>
        </Form>
    )
}
