'use client'

import Modal from '@/components/modal'
import { GraphQLFetcher } from '@/core/helpers'
import { NemuResponse, StatusCode } from '@/core/responses'
import { PaymentStatus } from '@/core/structures'
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/20/solid'
import { useState } from 'react'
import { toast } from 'react-toastify'
import CommissionFormSubmissionContent from './commission-form-submission-content'
import { Commission, FormSubmission, User } from '@prisma/client'

export default function CommissionFormSubmissionDisplay({
    submission,
    commission,
    stripe_account
}: {
    submission: FormSubmission & { user: User & { find_customer_id: { customerId: string } } }
    commission: Commission
    stripe_account: string
}) {
    const [showModal, setShowModal] = useState(false)
    const [accepted, setAccepted] = useState(false)
    const [rejected, setRejected] = useState(false)

    async function UpdateRequest(accepted_commission: boolean) {
        const response = await GraphQLFetcher<{ accept_reject_commission: NemuResponse }>(
            `mutation AcceptRejectCommission($invoice_create_data: InvoiceCreateInputType!) {
                accept_reject_commission(create_data: $invoice_create_data, accepted: ${accepted_commission}) {
                    status
                    message
                }
            }`,
            {
                invoice_create_data: {
                    customer_id: submission.user.find_customer_id.customerId,
                    user_id: submission.user.id,
                    artist_id: commission.artistId,
                    stripe_account: stripe_account,

                    initial_item_name: commission.title,
                    initial_item_price: commission.price,
                    initial_item_quantity: 1,

                    form_submission_id: submission.id
                }
            }
        )

        if (response.accept_reject_commission.status != StatusCode.Success) {
            toast('Failed to accept request', { theme: 'dark', type: 'error' })
        }

        return
    }

    return (
        <>
            <tr>
                <th>
                    {submission.user.name} {submission.waitlist && <span className="badge badge-warning ml-1">Waitlist</span>}
                </th>
                <td>
                    <p>{new Date(submission.createdAt).toDateString()}</p>
                </td>
                <td>
                    <div className="dropdown">
                        <div tabIndex={0} role="button" className="btn btn-primary">
                            View Actions
                        </div>
                        <ul tabIndex={0} className="p-2 shadow menu dropdown-content z-[10] bg-base-100 rounded-xl w-52">
                            <li>
                                <button onClick={() => setShowModal(true)}>View Submission</button>
                            </li>
                            <li>
                                <button
                                    type="button"
                                    disabled={accepted || rejected}
                                    onClick={() => {
                                        setAccepted(true)
                                        UpdateRequest(true)
                                    }}
                                >
                                    Accept
                                </button>
                            </li>
                            <li>
                                <button
                                    type="button"
                                    disabled={accepted || rejected}
                                    onClick={() => {
                                        setRejected(true)
                                        UpdateRequest(false)
                                    }}
                                >
                                    Reject
                                </button>
                            </li>
                        </ul>
                    </div>
                </td>
            </tr>

            <Modal showModal={showModal} setShowModal={setShowModal}>
                <div className="flex flex-col w-full gap-5">
                    <div className="flex justify-between gap-5 w-full">
                        <div>
                            <h2 className="card-title">{submission.user.name}'s Request</h2>
                            <h2 className="font-bold text-md text-base-content/80">{new Date(submission.createdAt).toDateString()}</h2>
                        </div>
                        <div className="flex gap-5 justify-between">
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={() => {
                                    setAccepted(true)
                                    UpdateRequest(true)
                                }}
                            >
                                <CheckCircleIcon className="w-6 h-6" />
                                Accept
                            </button>
                            <button
                                type="button"
                                className="btn btn-error"
                                onClick={() => {
                                    setRejected(true)
                                    UpdateRequest(false)
                                }}
                            >
                                <XCircleIcon className="w-6 h-6" />
                                Reject
                            </button>
                        </div>
                    </div>
                    <div className="divider"></div>
                    <div className="flex flex-col gap-5 w-full rp">
                        <CommissionFormSubmissionContent content={submission.content} />
                    </div>
                </div>
            </Modal>
        </>
    )
}
