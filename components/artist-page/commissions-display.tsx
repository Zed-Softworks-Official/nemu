'use client'

import Markdown from 'react-markdown'

import { CommissionAvailability, CommissionItem } from '@/core/structures'
import CommissionPaymentInfo from '../payments/commission-payment-info'
import ImageViewer from './image-veiwer'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

export default function CommissionsDisplay({
    commission,
    terms,
    setShowForm
}: {
    commission: CommissionItem
    terms: string
    setShowForm: (showForm: boolean) => void
}) {
    const { data: session } = useSession()
    const { replace } = useRouter()

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
        <div className="grid md:grid-cols-3 grid-cols-1 gap-5 scrollbar-none">
            <ImageViewer
                featured_image={commission.featured_image!}
                additional_images={commission.images!}
            />
            <div className="bg-base-300 rounded-xl col-span-2">
                <div className="card h-full">
                    <div className="card-body">
                        <h1 className="card-title font-bold text-3xl">
                            {commission.title}
                            {convertAvailabilityToBadge(commission.availability!)}
                        </h1>
                        <p>
                            <Markdown>{commission.description}</Markdown>
                        </p>
                        <div className="card-actions justify-between">
                            <CommissionPaymentInfo price={commission.price} />
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={() => {
                                    if (!session) {
                                        return replace('/u/login')
                                    }

                                    setShowForm(true)
                                }}
                            >
                                Commission
                            </button>
                        </div>
                        <div className="divider">Terms &amp; Conditions</div>
                        <div className="prose">
                            <Markdown>{terms}</Markdown>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
