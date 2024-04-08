'use client'

import Link from 'next/link'
import NemuImage from '../nemu-image'

import { CommissionStatus, GetUserRequestsResponse } from '@/core/structures'
import { ConvertCommissionStatusToBadge } from '@/core/react-helpers'

export default function RequestTable({
    requests
}: {
    requests: GetUserRequestsResponse
}) {
    return (
        <div className="card shadow-xl bg-base-200">
            <div className="card-body">
                {requests.map((request) => (
                    <div
                        key={request.id}
                        className="card lg:card-side shadow-xl bg-base-100"
                    >
                        <figure>
                            <NemuImage
                                src={request.commission.featuredImage}
                                alt="Commission Image"
                                width={200}
                                height={200}
                            />
                        </figure>
                        <div className="card-body flex-row justify-between gap-5">
                            <div className="flex flex-col h-full">
                                <div className="flex flex-col gap-2">
                                    <h2 className="card-title">
                                        {request.commission.title}
                                        {ConvertCommissionStatusToBadge(request.status)}
                                    </h2>
                                    <p>
                                        By{' '}
                                        <Link
                                            href={`/@${request.commission?.artist.handle}`}
                                            className="link link-hover"
                                        >
                                            @{request.commission?.artist.handle}
                                        </Link>
                                    </p>
                                </div>
                                <span className="flex h-full items-end italic text-base-content/80">
                                    Requested on:{' '}
                                    {new Date(request.createdAt).toDateString()}
                                </span>
                            </div>
                            {request.status !== CommissionStatus.WaitingApproval && (
                                <div className="card shadow-xl bg-base-300">
                                    <div className="card-body">
                                        <h2 className="card-title">Quick Access</h2>
                                        <div className="divider"></div>
                                        <div className="flex gap-5">
                                            {(request.status ===
                                                CommissionStatus.Accepted ||
                                                request.status ===
                                                    CommissionStatus.Delivered) && (
                                                <Link
                                                    href={`/requests/${request.orderId}`}
                                                    className="btn btn-primary"
                                                >
                                                    View Request
                                                </Link>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
                {requests.length === 0 && (
                    <div className="flex flex-col w-full justify-center items-center gap-5">
                        <NemuImage
                            src={'/nemu/this-is-fine.png'}
                            alt="This is fine"
                            width={200}
                            height={200}
                        />
                        <h2 className="card-title">Nothing Here Yet!</h2>
                    </div>
                )}
            </div>
        </div>
    )
}
