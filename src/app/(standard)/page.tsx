'use client'

import { Button } from '~/components/ui/button'
import { api } from '~/trpc/react'

export default function Home() {
    const mutation = api.user.update_user.useMutation()

    return (
        <Button
            onClick={() => {
                mutation.mutate()
            }}
        >
            Add Metadata to user
        </Button>
    )
}
