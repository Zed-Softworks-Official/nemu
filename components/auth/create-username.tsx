'use client'

import TextField from '@/components/form/text-input'
import { api } from '@/core/api/react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'react-toastify'

import * as z from 'zod'

const usernameSchema = z.object({
    username: z.string().min(2).max(50)
})

type UsernameSchemaType = z.infer<typeof usernameSchema>

export default function CreateUsername() {
    const [error, setError] = useState(false)
    const [errorMessage, setErrorMessage] = useState('Something')

    const mutation = api.user.set_username.useMutation({
        onSuccess() {
            toast('Username Set', { theme: 'dark', type: 'success' })
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
            <form
                onSubmit={form.handleSubmit(CreateUsername)}
                className="flex flex-col gap-5"
            >
                {error && (
                    <div className="bg-error w-full p-5 rounded-xl">
                        <p>{errorMessage}</p>
                    </div>
                )}
                <TextField
                    label="Username"
                    placeholder="Username"
                    {...form.register('username')}
                    error={error}
                />
                <button type="submit" className="btn btn-primary w-full">
                    Set Username
                </button>
            </form>
        </div>
    )
}
