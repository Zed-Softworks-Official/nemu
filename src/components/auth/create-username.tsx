'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'

import * as z from 'zod'
import { Form, FormField, FormItem, FormLabel } from '~/components/ui/form'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import { api } from '~/trpc/react'
import { useTheme } from 'next-themes'
import { nemu_toast } from '~/lib/utils'

const usernameSchema = z.object({
    username: z.string().min(2).max(50)
})

type UsernameSchemaType = z.infer<typeof usernameSchema>

export default function CreateUsername() {
    const [error, setError] = useState(false)
    const [errorMessage, setErrorMessage] = useState('Something')
    const { resolvedTheme } = useTheme()

    const mutation = api.user.set_username.useMutation({
        onSuccess() {
            nemu_toast('Username Set', { theme: resolvedTheme, type: 'success' })
            replace('/')
        },
        onError() {
            setErrorMessage('That username already exists!')
            setError(true)
        }
    })

    const form = useForm<UsernameSchemaType>({
        resolver: zodResolver(usernameSchema),
        mode: 'onSubmit'
    })

    const { replace } = useRouter()

    function CreateUsername(values: UsernameSchemaType) {
        mutation.mutate(values.username)
    }

    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-col justify-center items-center">
                <h2 className="text-lg font-bold">It looks like you're new here.</h2>
                <p>Let's create a username for you.</p>
                <div className="divider"></div>
            </div>
            <Form {...form}>
                <form
                    onSubmit={form.handleSubmit(CreateUsername)}
                    className="flex flex-col gap-5"
                >
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
                    <div className="flex justify-end w-full">
                        <Button type="submit">Set Username</Button>
                    </div>
                </form>
            </Form>
        </div>
    )
}
