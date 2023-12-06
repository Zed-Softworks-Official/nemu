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
                className="btn btn-outline btn-accent m-5"
            >
                Click here to become an artist
            </button>
        </>
    )
}
