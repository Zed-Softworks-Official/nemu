'use client'

import useSWR from 'swr'
import DashboardContainer from '../../dashboard-container'
import { GraphQLFetcher } from '@/core/helpers'
import Loading from '@/components/loading'
import { PaymentStatus } from '@/core/structures'
import Kanban from '@/components/kanban/kanban'
import CommissionFormSubmissionContent from '../submissions/commission-form-submission-content'

export default function DashboardCommissionDetailView({
    slug,
    order_id
}: {
    slug: string
    order_id: string
}) {
    const { data, isLoading } = useSWR(
        `{
            form_submission(order_id: "${order_id}") {
                content
                createdAt
                paymentStatus
                user {
                    name
                }
                form {
                    commission {
                        title
                    }
                }
            }
        }`,
        GraphQLFetcher<{
            form_submission: {
                content: string
                createdAt: Date
                paymentStatus: PaymentStatus
                user: {
                    name: string
                }
                form: {
                    commission: {
                        title: string
                    }
                }
            }
        }>
    )

    if (isLoading) {
        return (
            <DashboardContainer title="" ignoreTitle>
                <Loading />
            </DashboardContainer>
        )
    }

    return (
        <DashboardContainer title={`Commission For ${data?.form_submission.user.name}`}>
            <div className="flex flex-col gap-5">
                <div className="card bg-base-100 shadow-xl">
                    <div className="card-body">
                        <h2 className="card-title">Form Responses</h2>
                        <div className="divider"></div>
                        <CommissionFormSubmissionContent
                            content={data?.form_submission.content!}
                        />
                    </div>
                </div>
                <div className="card bg-base-100 shadow-xl">
                    <div className="card-body">
                        <h2 className="card-title">Kanban</h2>
                        <div className="divider"></div>
                        <Kanban
                            title={data?.form_submission.form.commission.title!}
                            client={data?.form_submission.user.name!}
                        />
                    </div>
                </div>
                <div className="card bg-base-100 shadow-xl">
                    <div className="card-body">
                        <h2 className="card-title">Messages</h2>
                        <div className="divider"></div>
                    </div>
                </div>
            </div>
        </DashboardContainer>
    )
}
