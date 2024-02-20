'use client'

import { useState } from 'react'
import NemuImage from '../nemu-image'
import Markdown from 'react-markdown'

import { CommissionAvailability, CommissionItem } from '@/core/structures'
import CommissionPaymentInfo from '../payments/commission-payment-info'

export default function CommissionsDisplay({
    commission,
    terms,
    setShowForm
}: {
    commission: CommissionItem
    terms: string
    setShowForm: (showForm: boolean) => void
}) {
    const [currentImage, setCurrentImage] = useState(commission.featured_image!)

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
            <div className="bg-base-300 rounded-xl overflow-hidden">
                <NemuImage src={currentImage} alt={'Image'} width={500} height={500} />
                <div className="grid grid-cols-3 mt-5 gap-5">
                    <NemuImage
                        src={commission.featured_image!}
                        className="hover:cursor-pointer roundex-xl transition-all hover:scale-110 scale-100 duration-200"
                        alt={'Image'}
                        width={100}
                        height={100}
                        onClick={() => setCurrentImage(commission.featured_image!)}
                    />
                    {commission.images?.map((image, i) => (
                        <NemuImage
                            key={i}
                            src={image}
                            className="hover:cursor-pointer rounded-xl transition-all hover:scale-110 scale-100 duration-200"
                            alt={'image'}
                            width={100}
                            height={100}
                            onClick={() => setCurrentImage(image)}
                        />
                    ))}
                </div>
            </div>
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
                            <CommissionPaymentInfo
                                price={commission.price}
                                use_invoicing={commission.use_invoicing!}
                            />
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={() => setShowForm(true)}
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
