'use client'

import Modal from '@/components/modal'
import { FormResponses } from '@/core/responses'
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/20/solid'
import { useState } from 'react'
import { FormElementInstance } from '../elements/form-elements'

export default function CommissionFormSubmissionDisplay({
    submission,
    form_labels
}: {
    submission: FormResponses
    form_labels: FormElementInstance[]
}) {
    const [showModal, setShowModal] = useState(false)

    return (
        <>
            <tr>
                <th>
                    <div className="badge badge-primary badge-xs mr-2"></div>
                    {submission.username}
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
                                <a>Accept</a>
                            </li>
                            <li>
                                <a>Reject</a>
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
                                {submission.username}'s Request
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
                                        {form_labels[i].extra_attributes?.label}
                                    </h2>
                                    <h3 className="m-0">
                                        Reponse: {JSON.parse(submission.content)[key]}
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
