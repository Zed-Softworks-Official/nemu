'use client'

import useSWR from 'swr'
import Loading from '@/components/loading'

import { fetcher } from '@/helpers/fetcher'
import { useSession } from 'next-auth/react'

import {
    CommissionAvailability,
    CommissionResponse
} from '@/helpers/api/request-inerfaces'
import NemuImage from '@/components/nemu-image'

export default function Commissions({ user_id }: { user_id: string }) {
    const { data: session } = useSession()
    const { data, isLoading } = useSWR<CommissionResponse>(
        `/api/artist/${session?.user.user_id}/commission`,
        fetcher
    )

    if (isLoading) {
        return <Loading />
    }

    function convertAvailabilityToBadge(availability: CommissionAvailability) {
        switch (availability) {
            case CommissionAvailability.Closed:
                return <div className="badge badge-error badge-lg">Closed</div>
            case CommissionAvailability.Waitlist:
                return <div className="badge badge-warning badge-lg">Waitlist</div>
            case CommissionAvailability.Open:
                return <div className="badge badge-success badge-lg">Open</div>
        }
    }

    return (
        <div className="grid grid-cols-1 gap-5">
            {data?.commissions?.map((commission) => (
                <div key={commission.slug} className="card lg:card-side bg-base-100">
                    <figure>
                        <NemuImage
                            src={commission.featured_image}
                            alt={commission.name}
                            width={200}
                            height={200}
                        />
                    </figure>
                    <div className="card-body">
                        <h2 className="card-title">
                            {commission.name}
                            {convertAvailabilityToBadge(commission.availability)}
                        </h2>
                        <p>{commission.description}</p>
                        <div className="card-actions justify-end">
                            <p className="font-bold text-2xl">${commission.price}</p>
                            <button type="button" className="btn btn-primary" disabled={commission.availability == CommissionAvailability.Closed}>
                                View Commission
                            </button>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    )
}
