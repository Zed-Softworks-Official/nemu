'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

export default function ArtistApplyButton() {
    const { data: session } = useSession()
    const { push, replace } = useRouter()

    function routeUser() {
        if (!session?.user) {
            return push('/api/auth/login')
        }

        return replace('/artists/apply/step-one')
    }

    return (
        <>
            <button
                onClick={routeUser}
                className="border-2 border-white p-5 hover:underline rounded-3xl m-5"
            >
                Click here to become an artist
            </button>
        </>
    )
}