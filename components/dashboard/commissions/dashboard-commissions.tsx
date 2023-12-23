'use client'

import Loading from '@/components/loading'
import { CommissionResponse } from '@/helpers/api/request-inerfaces'
import { fetcher } from '@/helpers/fetcher'
import { useSession } from 'next-auth/react'
import useSWR from 'swr'

export default function DashboardCommissions() {
    const { data: session } = useSession()
    const { data, isLoading } = useSWR<CommissionResponse>(
        `/api/artist/${session?.user.user_id}/commission`,
        fetcher
    )

    if (isLoading) {
        return <Loading />
    }

    return <pre>{JSON.stringify(data, null, 2)}</pre>
}
