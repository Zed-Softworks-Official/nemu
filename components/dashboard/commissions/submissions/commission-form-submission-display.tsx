'use client'

import Modal from '@/components/modal'
import { GraphQLFetcher } from '@/core/helpers'
import { StatusCode } from '@/core/responses'
import { PaymentStatus } from '@/core/structures'
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/20/solid'
import { useState } from 'react'
import { toast } from 'react-toastify'

export default function CommissionFormSubmissionDisplay({
    submission,
    stripe_account,
    form_id,
    use_invoicing
}: {
    submission: {
        id: string
        content: string
        createdAt: Date
        paymentIntent: string
        paymentStatus: PaymentStatus
        user: { name: string }
    }
    stripe_account: string
    form_id: string
    use_invoicing: boolean
}) {
    const [showModal, setShowModal] = useState(false)
    const [accepted, setAccepted] = useState(false)
    const [rejected, setRejected] = useState(false)

    async function AcceptRequest() {
        // TODO: Check if we're using invoincing

        // Accept Payment intent
        const response = await GraphQLFetcher<{
            accept_payment_intent: {
                status: StatusCode
                message?: string
            }
        }>(
            `{
                accept_payment_intent(payment_intent:"${submission.paymentIntent}", stripe_account: "${stripe_account}", submission_id: "${submission.id}", form_id: "${form_id}") {
                    status
                    message
                }
            }`
        )

        if (
            response.accept_payment_intent.status != StatusCode.Success
        ) {
            toast(response.accept_payment_intent.message!, {
                theme: 'dark',
                type: 'error'
            })
        }
    }

    async function RejectRequest() {
        // Reject payment intent
        
    }

    return (
        <>
            <tr>
                <th>
                    {/* <div className="badge badge-primary badge-xs mr-2"></div> */}
                    {submission.user.name}
                </th>
                <td>
                    <p>{new Date(submission.createdAt).toDateString()}</p>
                </td>
                <td>
                    <div className="dropdown">
                        <div tabIndex={0} role="button" className="btn btn-primary">
                            View Actions
                        </div>
                        <ul
                            tabIndex={0}
                            className="p-2 shadow menu dropdown-content z-[10] bg-base-100 rounded-xl w-52"
                        >
                            <li>
                                <button onClick={() => setShowModal(true)}>
                                    View Submission
                                </button>
                            </li>
                            <li>
                                <button
                                    type="button"
                                    disabled={accepted || rejected}
                                    onClick={() => {
                                        setAccepted(true)
                                        AcceptRequest()
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
                                        RejectRequest()
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
                            <h2 className="card-title">
                                {submission.user.name}'s Request
                            </h2>
                            <h2 className="font-bold text-md text-base-content/80">
                                {new Date(submission.createdAt).toDateString()}
                            </h2>
                        </div>
                        <div className="flex gap-5 justify-between">
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={() => {
                                    setAccepted(true)
                                    AcceptRequest()
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
                                    RejectRequest()
                                }}
                            >
                                <XCircleIcon className="w-6 h-6" />
                                Reject
                            </button>
                        </div>
                    </div>
                    <div className="divider"></div>
                    <div className="flex flex-col gap-5 prose w-full mx-auto">
                        {Object.keys(JSON.parse(submission.content)).map((key, i) => (
                            <div key={i} className="card bg-base-300 shadow-xl">
                                <div className="card-body">
                                    <h2 className="m-0">
                                        {JSON.parse(submission.content)[key].label}
                                    </h2>
                                    <h3 className="m-0">
                                        Reponse:{' '}
                                        {JSON.parse(submission.content)[key].value}
                                    </h3>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </Modal>
        </>
    )
}
