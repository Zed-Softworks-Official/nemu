'use client'

import { api } from '~/trpc/react'

export default function CommissionsDisplay({ artist_id }: { artist_id: string }) {
    const { data, isLoading } = api.commission.get_commissions.useQuery({ artist_id })

    if (isLoading) {
        return <></>
    }

    return <pre>{JSON.stringify(data, null, 2)}</pre>
}
