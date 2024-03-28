'use client'

import { trpc } from '@/app/_trpc/client'
import CommissionCard from './commission-card'
import { CommissionItem } from '@/core/structures'
import Loading from '../loading'
import { notFound } from 'next/navigation'

export default function Commissions({
    artist_id,
    terms
}: {
    artist_id: string
    terms: string
}) {
    const { data, isLoading, error } = trpc.get_commissions.useQuery({ artist_id })

    if (isLoading) {
        return <Loading />
    }

    if (error) {
        return notFound()
    }

    return (
        <div className="flex flex-col gap-5">
            {data?.map(
                (commission) =>
                    commission.published! && (
                        <CommissionCard
                            key={commission.title}
                            commission={commission as CommissionItem}
                            terms={terms}
                        />
                    )
            )}
        </div>
    )
}
