'use client'

import { CommissionAvailability, CommissionItem } from '@/core/structures'
import { useState } from 'react'

import NemuImage from '@/components/nemu-image'
import CommissionsDisplay from './commissions-display'
import Modal from '../modal'
import CommissionFormSubmitView from '../form-builder/submissions/commission-form-submit-view'

export default function CommissionCard({
    commission,
    terms,
    user_id
}: {
    commission: CommissionItem
    terms: string,
    user_id: string
}) {
    const [showModal, setShowModal] = useState(false)
    const [showForm, setShowForm] = useState(false)

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
        <div key={commission.slug} className="card lg:card-side bg-base-100 shadow-xl animate-pop-in transition-all duration-200">
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
                            <CommissionFormSubmitView form_id={`6599e94581a036161c6130eb`} artist={user_id} /> // commission.form_id
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
