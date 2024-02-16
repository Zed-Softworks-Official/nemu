'use client'

import Modal from '@/components/modal'
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/20/solid'
import { useState } from 'react'

export default function CommissionFormSubmissionDisplay({
    submission,
    use_invoicing
}: {
    submission: { content: string; createdAt: Date; user: { name: string } },
    use_invoicing: boolean
}) {
    const [showModal, setShowModal] = useState(false)
    const [accepted, setAccepted] = useState(false)
    const [rejected, setRejected] = useState(false)

    async function AcceptRequest() {
        // Accept Payment intent
    }

    async function RejectRequest() {
        // Reject payment intent
    }

    return (
        <>
            <tr>
                <th>
                    <div className="badge badge-primary badge-xs mr-2"></div>
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
                            <button type="button" className="btn btn-primary">
                                <CheckCircleIcon className="w-6 h-6" />
                                Accept
                            </button>
                            <button type="button" className="btn btn-error">
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
