'use client'

import { CommissionStatus, GetSubmissionsResponse } from '@/core/structures'
import NemuImage from '../nemu-image'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { ConvertCommissionStatusToBadge } from '@/core/react-helpers'

export default function RequestTable({
    submissions
}: {
    submissions: GetSubmissionsResponse
}) {
    return (
        <div className="card shadow-xl bg-base-300">
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
                            <div className="card shadow-xl bg-base-300 w-full">
                                <div className="card-body">
                                    <Link
                                        href={`/requests/${submission.orderId}`}
                                        className="btn btn-primary btn-wide"
                                    >
                                        View Request
                                    </Link>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
