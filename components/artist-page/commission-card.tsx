'use client'

import { CommissionAvailability, CommissionItem } from '@/core/structures'
import { useState } from 'react'

import NemuImage from '@/components/nemu-image'
import CommissionsDisplay from './commissions-display'
import Modal from '../modal'

import { ConvertAvailabilityToBadge } from '@/core/react-helpers'
import Markdown from 'react-markdown'
import CommissionPaymentInfo from '../payments/commission-payment-info'
import FavoriteButton from './favorite-button'
import CommissionRequestSubmitView from '../form-builder/requests/commission-request-submit-form'
import { ArrowLeftCircleIcon } from 'lucide-react'

export default function CommissionCard({
    commission,
    terms
}: {
    commission: CommissionItem
    terms: string
}) {
    const [showModal, setShowModal] = useState(false)
    const [showForm, setShowForm] = useState(false)

    return (
        <div
            key={commission.slug}
            className="card lg:card-side bg-base-100 shadow-xl animate-pop-in transition-all duration-200"
        >
            <figure>
                <NemuImage
                    src={commission.featured_image?.signed_url!}
                    placeholder="blur"
                    blurDataURL={commission.featured_image?.blur_data}
                    alt={commission.title}
                    width={400}
                    height={400}
                    className="w-full h-full max-h-[22rem]"
                />
            </figure>
            <div className="card-body relative">
                <div className="flex justify-between pb-5">
                    <h2 className="card-title text-2xl">
                        {commission.title}
                        {ConvertAvailabilityToBadge(commission.availability!)}
                    </h2>
                    <FavoriteButton />
                </div>
                <p>
                    <Markdown>{commission.description}</Markdown>
                </p>
                <div className="card-actions justify-between items-center">
                    <CommissionPaymentInfo price={commission.price} />
                    <button
                        type="button"
                        className="btn btn-primary"
                        disabled={
                            commission.availability == CommissionAvailability.Closed
                        }
                        onClick={() => setShowModal(true)}
                    >
                        View Commission
                    </button>
                    <Modal showModal={showModal} setShowModal={setShowModal}>
                        {showForm ? (
                            <>
                                <div className="absolute left-5">
                                    <button
                                        type="button"
                                        className="btn btn-ghost"
                                        onClick={() => setShowForm(false)}
                                    >
                                        <ArrowLeftCircleIcon className="w-6 h-6" />
                                        Back
                                    </button>
                                </div>
                                <CommissionRequestSubmitView
                                    commission_id={commission.commission_id!}
                                    form_id={commission.form_id!}
                                />
                            </>
                        ) : (
                            <CommissionsDisplay
                                commission={commission}
                                terms={terms}
                                setShowForm={setShowForm}
                            />
                        )}
                    </Modal>
                </div>
            </div>
        </div>
    )
}
