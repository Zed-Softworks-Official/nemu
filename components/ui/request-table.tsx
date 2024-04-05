'use client'

import Link from 'next/link'
import NemuImage from '../nemu-image'

import { CommissionStatus, GetSubmissionsResponse } from '@/core/structures'
import { ConvertCommissionStatusToBadge } from '@/core/react-helpers'

export default function RequestTable({
    submissions
}: {
    submissions: GetSubmissionsResponse
}) {
    return (
        <div className="card shadow-xl bg-base-200">
            <div className="card-body">
                {submissions.map((submission) => (
                    <div
                        key={submission.id}
                        className="card lg:card-side shadow-xl bg-base-100"
                    >
                        <figure>
                            <NemuImage
                                src={'/nemu/sparkles.png'}
                                alt="Commission Image"
                                width={200}
                                height={200}
                            />
                        </figure>
                        <div className="card-body flex-row items-center gap-5">
                            <div className="flex flex-col gap-5">
                                <h2 className="card-title">
                                    {submission.form.commission?.title}
                                    {ConvertCommissionStatusToBadge(
                                        submission.commissionStatus
                                    )}
                                </h2>
                                <p>
                                    By{' '}
                                    <Link
                                        href={`/@${submission.form.commission?.artist.handle}`}
                                        className="link link-hover"
                                    >
                                        @{submission.form.commission?.artist.handle}
                                    </Link>
                                </p>
                            </div>
                            {submission.commissionStatus === CommissionStatus.Accepted ||
                                (submission.commissionStatus ===
                                    CommissionStatus.Delivered && (
                                    <div className="card shadow-xl bg-base-300 w-full">
                                        <div className="card-body justify-center items-center">
                                            <Link
                                                href={`/requests/${submission.orderId}`}
                                                className="btn btn-primary btn-wide"
                                            >
                                                View Request
                                            </Link>
                                        </div>
                                    </div>
                                ))}
                        </div>
                    </div>
                ))}
                {submissions.length === 0 && (
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
