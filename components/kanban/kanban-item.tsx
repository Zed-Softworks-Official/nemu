'use client'

import { ClassNames } from '@/core/helpers'
import { CommissionDataSubmission, CommissionStatus, KanbanTask } from '@/core/structures'
import { UniqueIdentifier } from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { CheckCircleIcon, TrashIcon, XCircleIcon } from '@heroicons/react/20/solid'
import { useState } from 'react'
import Modal from '../modal'
import CommissionFormSubmissionContent from '../dashboard/commissions/submissions/commission-form-submission-content'
import { usePathname, useRouter } from 'next/navigation'
import { api } from '@/core/trpc/react'

export default function KanbanItemComponent({
    item_data,
    DeleteTask,
    UpdateTask,
    disable_item_editing,
    submission_data
}: {
    item_data: KanbanTask
    DeleteTask: (id: UniqueIdentifier) => void
    UpdateTask: (id: UniqueIdentifier, content: string) => void
    disable_item_editing?: boolean
    submission_data?: CommissionDataSubmission
}) {
    const [mouseIsOver, setMouseIsOver] = useState(false)
    const [editMode, setEditMode] = useState(false)
    const [showModal, setShowModal] = useState(false)

    const pathname = usePathname()
    const slug = pathname.substring(pathname.lastIndexOf('/') + 1, pathname.length)

    // const mutation = api.commissions.accept_reject_commission.useMutation()

    const { setNodeRef, attributes, listeners, transform, transition, isDragging } =
        useSortable({
            id: item_data.id,
            data: {
                type: 'Task',
                item_data
            },
            disabled: editMode
        })

    const {replace} = useRouter()

    const style = {
        transition,
        transform: CSS.Transform.toString(transform)
    }

    function ToggleEditMode() {
        setEditMode(!editMode)
        setMouseIsOver(false)
    }

    // TODO:?????
    // const response = await GraphQLFetcher<{ accept_reject_commission: NemuResponse }>(
    //     `mutation AcceptRejectCommission($invoice_create_data: InvoiceCreateInputType!) {
    //         accept_reject_commission(create_data: $invoice_create_data, accepted: ${accepted_commission}) {
    //             status
    //             message
    //         }
    //     }`,
    //     {
    //         invoice_create_data: {
    //             customer_id: submission.user.find_customer_id.customerId,
    //             user_id: submission.user.id,
    //             artist_id: commission.artistId,
    //             stripe_account: stripe_account,

    //             initial_item_name: commission.title,
    //             initial_item_price: commission.price,
    //             initial_item_quantity: 1,

    //             form_submission_id: submission.id
    //         }
    //     }
    // )

    // if (response.accept_reject_commission.status != StatusCode.Success) {
    //     toast('Failed to accept request', { theme: 'dark', type: 'error' })
    // }

    if (isDragging) {
        return (
            <div
                ref={setNodeRef}
                style={style}
                className="card shadow-xl bg-base-100 opacity-60 border-2 border-primary"
            >
                <div className="card-body">
                    <div className="flex justify-between items-center w-full h-6 max-h-full"></div>
                </div>
            </div>
        )
    }

    if (editMode) {
        return (
            <div
                className="card shadow-xl bg-base-100 cursor-grab hover:ring-inset hover:ring-primary hover:ring-2"
                ref={setNodeRef}
                style={style}
                {...attributes}
                {...listeners}
            >
                <div className="card-body">
                    <div className="flex justify-between items-center w-full h-6">
                        <textarea
                            className="textarea textarea-primary resize-none w-full focus:outline-none"
                            defaultValue={item_data.content}
                            placeholder="Type something here"
                            autoFocus
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && e.shiftKey) {
                                    UpdateTask(item_data.id, e.currentTarget.value)
                                    ToggleEditMode()
                                }
                            }}
                            onBlur={(e) => {
                                UpdateTask(item_data.id, e.currentTarget.value)
                                ToggleEditMode()
                            }}
                        ></textarea>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <>
            <div
                onMouseEnter={() => {
                    setMouseIsOver(true)
                }}
                onMouseLeave={() => {
                    setMouseIsOver(false)
                }}
                onClick={() => {
                    if (disable_item_editing) {
                        if (submission_data) {
                            if (submission_data.commissionStatus == CommissionStatus.Accepted) {
                                return replace(`/dashboard/commissions/${slug}/${submission_data.orderId}`)
                            }
                        }
                    }

                    if (disable_item_editing) {
                        setShowModal(true)
                        return
                    }

                    ToggleEditMode()
                }}
                className={ClassNames(
                    'card shadow-xl bg-base-100 hover:ring-inset hover:ring-primary hover:ring-2',
                    disable_item_editing ? 'cursor-pointer' : 'cursor-grab'
                )}
                ref={setNodeRef}
                style={style}
                {...attributes}
                {...listeners}
            >
                <div className="card-body">
                    <div className="flex justify-between items-center w-full h-6 max-h-full">
                        <p className="w-full whitespace-pre-wrap">{item_data.content}</p>
                        {mouseIsOver && !disable_item_editing && (
                            <button
                                type="button"
                                className="btn btn-ghost"
                                onClick={() => {
                                    DeleteTask(item_data.id)
                                }}
                            >
                                <TrashIcon className="w-6 h-6" />
                            </button>
                        )}
                    </div>
                </div>
            </div>
            {submission_data && (
                <Modal showModal={showModal} setShowModal={setShowModal}>
                    <div className="flex flex-col w-full gap-5">
                        <div className="flex justify-between gap-5 w-full">
                            <div>
                                <h2 className="card-title">
                                    {submission_data.user.name}'s Request{' '}
                                    {submission_data.waitlist && (
                                        <span className="badge badge-warning ml-1">
                                            Waitlist
                                        </span>
                                    )}
                                </h2>
                                <h2 className="font-bold text-md text-base-content/80">
                                    {new Date(submission_data.createdAt).toDateString()}
                                </h2>
                            </div>
                            <div className="flex gap-5 justify-between">
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={() => {
                                        // setAccepted(true)
                                        // UpdateRequest(true)
                                    }}
                                >
                                    <CheckCircleIcon className="w-6 h-6" />
                                    Accept
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-error"
                                    onClick={() => {
                                        // setRejected(true)
                                        // UpdateRequest(false)
                                    }}
                                >
                                    <XCircleIcon className="w-6 h-6" />
                                    Reject
                                </button>
                            </div>
                        </div>
                        <div className="divider"></div>
                        <div className="flex flex-col gap-5 w-full rp">
                            <CommissionFormSubmissionContent content={submission_data.content} />
                        </div>
                    </div>
                </Modal>
            )}
        </>
    )
}
