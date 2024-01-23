'use client'

import useSWR from 'swr'
import Loading from '@/components/loading'

import { Fetcher } from '@/core/helpers'

import { CommissionResponse } from '@/core/responses'
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
        Fetcher
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
