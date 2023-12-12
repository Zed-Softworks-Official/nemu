'use client'

import useSWR from 'swr'
import Loading from '@/components/loading'

import { fetcher } from '@/helpers/fetcher'
import { useSession } from 'next-auth/react'

import { CommissionResponse } from '@/helpers/api/request-inerfaces'
import NemuImage from '@/components/nemu-image'

export default function Commissions() {
    const { data: session } = useSession()
    const { data, isLoading } = useSWR<CommissionResponse>(
        `/api/artist/${session?.user.user_id}/commission`,
        fetcher
    )

    if (isLoading) {
        return <Loading />
    }

    return (
        <div className="grid grid-cols-3">
            {data?.commissions?.map((commission) => (
                <div key={commission.slug} className="card bg-base-100">
                    <NemuImage
                        src={commission.featured_image}
                        alt={commission.name}
                        width={200}
                        height={200}
                    />
                    <div className="card-title">
                        {commission.name}
                    </div>
                </div>
            ))}
        </div>
    )
}
