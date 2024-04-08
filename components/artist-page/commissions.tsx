'use client'

import CommissionCard from './commission-card'
import { CommissionItem } from '@/core/structures'
import { notFound } from 'next/navigation'
import CommissionsSkeleton from '../skeleton/artist-page/commissions-skeleton'
import { api } from '@/core/trpc/react'

export default function Commissions({
    artist_id,
    terms
}: {
    artist_id: string
    terms: string
}) {
    const { data, isLoading, error } = api.commissions.get_commissions.useQuery({
        artist_id
    })

    if (isLoading) {
        return <CommissionsSkeleton />
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
