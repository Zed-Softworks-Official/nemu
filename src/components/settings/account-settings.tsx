'use client'

import * as z from 'zod'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { SaveIcon, UserIcon } from 'lucide-react'

import { Form, FormField, FormItem, FormLabel } from '~/components/ui/form'
import { Input } from '~/components/ui/input'
import { Button } from '~/components/ui/button'
import { UploadDropzone } from '~/components/uploadthing'
import { Avatar, AvatarImage, AvatarFallback } from '~/components/ui/avatar'
import { useState } from 'react'
import { User } from '@prisma/client'

const accountSchema = z.object({
    username: z
        .string()
        .optional()
        .refine((value) => value === '', 'Username must not be blank'),
    email: z
        .string()
        .email()
        .optional()
        .refine((value) => value === '', 'Email must not be blank')
})

type AccountSchemaType = z.infer<typeof accountSchema>

export default function AccountSettings({
    user,
    artist_id
}: {
    user: User
    artist_id?: string
}) {
    const [profilePhoto, setProfilePhoto] = useState('/profile.png')

    const form = useForm<AccountSchemaType>({
        resolver: zodResolver(accountSchema),
        mode: 'onSubmit'
    })

    return (
        <Form {...form}>
            <form className="flex flex-col gap-5">
                <Avatar>
                    <AvatarImage src={profilePhoto} />
                    <AvatarFallback>
                        <UserIcon className="w-6 h-6" />
                    </AvatarFallback>
                </Avatar>
                <UploadDropzone
                    endpoint="profilePhotoUploader"
                    onClientUploadComplete={(res) => {
                        if (res[0]) {
                            setProfilePhoto(res[0].serverData.url)
                        }
                    }}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <FormField
                        control={form.control}
                        name="username"
                        render={({ field }) => (
                            <FormItem className="form-control">
                                <FormLabel className="label">Username</FormLabel>
                                <Input placeholder="Username" {...field} />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                            <FormItem className="form-control">
                                <FormLabel className="label">Email</FormLabel>
                                <Input placeholder="Email" {...field} />
                            </FormItem>
                        )}
                    />
                </div>
                <div className="flex justify-end">
                    <Button type="submit" className="w-1/4">
                        <SaveIcon className="w-6 h-6" />
                        Save
                    </Button>
                </div>
            </form>
        </Form>
    )
}
