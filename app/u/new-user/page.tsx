'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { FormEvent, useState } from 'react'

export default function NewUser() {
    const [error, setError] = useState(false)
    const [username, setUsername] = useState('')
    const [errorMessage, setErrorMessage] = useState('')

    const { data: session } = useSession()

    const { push } = useRouter()

    if (session?.user.name) {
        push('/')
    }

    async function createUsername(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()

        const checkUser = await fetch(`/api/username/${username}`, {
            method: 'get'
        })

        const user = await checkUser.json()
        if (user.error) {
            setError(user.error)
            setErrorMessage(user.message)
            return
        }

        const createUser = await fetch(`/api/username/${username}`, {
            method: 'post',
            body: JSON.stringify({
                current_user: session?.user.user_id
            })
        })

        push('/')
    }

    return (
        <>
            <div className="pb-5 text-center">
                <h2 className="text-lg font-bold">It looks like you&apos;re new here.</h2>
                <p>Let&apos;s create a username for you.</p>
            </div>
            <form onSubmit={createUsername}>
                {error && (
                    <div className="bg-error w-full p-5 rounded-xl">
                        <p>{errorMessage}</p>
                    </div>
                )}
                <div className="mt-5">
                    <input
                        name="username"
                        type="text"
                        className="bg-white dark:bg-charcoal p-5 rounded-xl w-full"
                        placeholder="Username"
                        onChange={(e) => setUsername(e.target.value)}
                        required
                        maxLength={16}
                        minLength={3}
                    />
                </div>
                <div className="mt-5">
                    <button type="submit" className="btn btn-primary w-full">
                        Set Username
                    </button>
                </div>
            </form>
        </>
    )
}
