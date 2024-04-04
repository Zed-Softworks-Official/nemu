'use client'

import * as z from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { User } from '@prisma/client'
import TextField from '../form/text-input'

const accountSchema = z.object({
    name: z.string().optional(),
    email: z.string().optional()
})

type AccountSchemaType = z.infer<typeof accountSchema>

export default function AccountSettings({ user }: { user: User }) {
    const form = useForm<AccountSchemaType>({
        resolver: zodResolver(accountSchema),
        mode: 'onBlur',
        defaultValues: {
            name: user.name || undefined,
            email: user.email || undefined
        }
    })

    async function ProcessForm(values: AccountSchemaType) {
        // Check if values were deleted

        console.log(values)
    }

    return (
        <form className="flex flex-col gap-5" onBlur={form.handleSubmit(ProcessForm)}>
            <TextField label="Username" {...form.register('name')} />
            <TextField label="Email" {...form.register('email')} />
        </form>
    )
}
