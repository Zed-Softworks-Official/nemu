'use client'

import { GetSubmissionsResponse } from '@/core/structures'
import NemuImage from '../nemu-image'

export default function RequestTable({
    submissions
}: {
    submissions: GetSubmissionsResponse
}) {
    return (
        <div className="card shadow-xl bg-base-300">
            <div className="card-body">
                {submissions.map((submission) => (
                    <div className="card lg:card-side shadow-xl bg-base-100">
                        <figure>
                            <NemuImage
                                src={'/nemu/sparkles.png'}
                                alt="Commission Image"
                                width={200}
                                height={200}
                            />
                        </figure>
                        <div className="card-body">
                            <h2 className="card-title">
                                {submission.form.commission?.title}
                                <span className="badge badge-success badge-lg">
                                    In Progress
                                </span>
                            </h2>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
