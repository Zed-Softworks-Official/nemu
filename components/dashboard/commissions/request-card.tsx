'use client'

import Modal from '@/components/modal'
import { CommissionRequestData } from '@/core/structures'
import { api } from '@/core/api/react'
import { RefetchOptions } from '@tanstack/react-query'
import { useState } from 'react'
import CommissionRequestContent from './requests/commission-request-content'
import { toast } from 'react-toastify'
import { CheckCircleIcon, XCircleIcon } from 'lucide-react'

export default function RequestCard({
    data,
    refetch
}: {
    data: CommissionRequestData
    refetch: (options?: RefetchOptions | undefined) => any
}) {
    const [show, setShow] = useState(false)
    const [disabled, setDisabled] = useState(false)
    const mutation = api.commissions.accept_reject_commission.useMutation({
        onSuccess: (res) => {
            toast(`Commission ${res.accepted ? 'Accepted' : 'Rejected'}!`, {
                theme: 'dark',
                type: 'success'
            })
            setDisabled(true)
            
            refetch()
        },
        onError: () => {
            toast('Failed to update commission!', { theme: 'dark', type: 'success' })
        }
    })

    return (
        <>
            <div
                className="card bg-base-200 shadow-xl cursor-pointer"
                onClick={() => setShow(true)}
            >
                <div className="card-body">
                    <h2 className="card-title">{data.user.name}</h2>
                    <span className="text-base-content/80">
                        {new Date(data.createdAt).toDateString()}
                    </span>
                </div>
            </div>
            <Modal showModal={show} setShowModal={setShow}>
                <div className="flex flex-col gap-5">
                    <div className="flex justify-between items-center">
                        <div className="flex flex-col gap-2">
                            <h2 className="card-title">{data.user.name}</h2>
                            <span className="text-base-content/80">
                                {new Date(data.createdAt).toDateString()}
                            </span>
                        </div>
                        <div className="flex gap-5">
                            <button
                                type="button"
                                className="btn btn-primary"
                                disabled={mutation.isPending || disabled}
                                onClick={() => {
                                    mutation.mutate({
                                        accepted: true,
                                        create_data: {
                                            request_id: data.id
                                        }
                                    })
                                }}
                            >
                                <CheckCircleIcon className="w-6 h-6" /> Accept
                            </button>
                            <button
                                type="button"
                                className="btn btn-error"
                                disabled={mutation.isPending || disabled}
                                onClick={() => {
                                    mutation.mutate({
                                        accepted: false,
                                        create_data: {
                                            request_id: data.id
                                        }
                                    })
                                }}
                            >
                                <XCircleIcon className="w-6 h-6" /> Reject
                            </button>
                        </div>
                    </div>
                    <div className="divider"></div>
                    <CommissionRequestContent content={data.content} />
                </div>
            </Modal>
        </>
    )
}
