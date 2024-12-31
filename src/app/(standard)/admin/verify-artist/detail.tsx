'use client'

import Loading from '~/components/ui/loading'
import { api } from '~/trpc/react'

export default function VertificationDataTable() {
    const { data, isLoading } =
        api.artist_verification.get_artist_verifications.useQuery()

    if (isLoading) {
        return (
            <div className="flex h-screen w-full items-center justify-center">
                <Loading />
            </div>
        )
    }

    return <pre>{JSON.stringify(data, null, 2)}</pre>
}
