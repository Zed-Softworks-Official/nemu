'use client'

import { CommissionStatus } from '@/core/data-structures/form-structures'
import { PaymentStatus } from '@/core/structures'
import Link from 'next/link'
import Masonry, { ResponsiveMasonry } from 'react-responsive-masonry'

export default function ActiveCommissionFormSubmissions({
    form_submissions,
    commission_slug
}: {
    commission_slug: string
    form_submissions: {
        id: string
        content: string
        createdAt: Date
        orderId: string
        paymentIntent: string
        paymentStatus: PaymentStatus
        commissionStatus: CommissionStatus
        user: { name: string }
    }[]
}) {
    return (
        <ResponsiveMasonry columnsCountBreakPoints={{ 350: 1, 900: 2, 1024: 3, 1280: 4 }}>
            <Masonry gutter="3rem">
                {form_submissions.map(
                    (submission) =>
                        submission.commissionStatus == CommissionStatus.Accepted && (
                            <Link href={`/dashboard/commissions/${commission_slug}/${submission.orderId}`}>
                                <div className="card bg-base-300 shadow-xl animate-pop-in transition-all duration-200">
                                    <div className="card-body">
                                        <h2 className="card-title">{submission.user.name}</h2>
                                        <p className="text-base-content/80">
                                            <i>Maybe Artist Note here</i>
                                        </p>
                                    </div>
                                </div>
                            </Link>
                        )
                )}
            </Masonry>
        </ResponsiveMasonry>
    )
}
