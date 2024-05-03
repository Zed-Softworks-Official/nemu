'use client'

import { useUser } from '@clerk/nextjs'
import { Button } from '~/components/ui/button'
import { api } from '~/trpc/react'

export default function Home() {
    const mutation = api.user.update_user.useMutation()
    const mutation2 = api.user.add_username.useMutation()
    const { user } = useUser()

    return (
        <div className="flex flex-col gap-5">
            <Button
                onClick={() => {
                    mutation.mutate()
                }}
            >
                Add Metadata to user
            </Button>
            <Button
                onClick={() => {
                    mutation2.mutate()
                }}
            >
                Current Username: {user?.username}
            </Button>
        </div>
    )
}
