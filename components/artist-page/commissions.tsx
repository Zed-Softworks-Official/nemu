'use client'

import useSWR from 'swr'
import Loading from '@/components/loading'

import { fetcher } from '@/helpers/fetcher'

import { CommissionResponse } from '@/helpers/api/request-inerfaces'
import CommissionCard from './commission-card'

export default function Commissions({
    user_id,
    terms
}: {
    user_id: string
    terms: string
}) {
    const { data, isLoading } = useSWR<CommissionResponse>(
        `/api/artist/${user_id}/commission`,
        fetcher
    )

    if (isLoading) {
        return <Loading />
    }

    return (
        <div className="flex flex-col gap-5">
            {data?.commissions?.map((commission) => (
                <CommissionCard commission={commission} terms={terms} user_id={user_id} />
            ))}
        </div>
    )
}
