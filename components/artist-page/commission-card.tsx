'use client'

import { CommissionAvailability, CommissionItem } from '@/core/structures'
import { useState } from 'react'

import NemuImage from '@/components/nemu-image'
import CommissionsDisplay from './commissions-display'
import Modal from '../modal'
import CommissionFormSubmitView from '../form-builder/submissions/commission-form-submit-view'

import { ConvertAvailabilityToBadge } from '@/core/react-helpers'
import Markdown from 'react-markdown'

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
                    src={commission.featured_image!}
                    alt={commission.title}
                    width={200}
                    height={200}
                />
            </figure>
            <div className="card-body">
                <h2 className="card-title">
                    {commission.title}
                    {ConvertAvailabilityToBadge(commission.availability!)}
                </h2>
                <p><Markdown>{commission.description}</Markdown></p>
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
                            <CommissionFormSubmitView
                                form_id={commission.form_id!}
                                artist={''}
                            />
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
