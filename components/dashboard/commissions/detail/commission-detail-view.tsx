'use client'

import useSWR from 'swr'
import DashboardContainer from '../../dashboard-container'
import { GraphQLFetcher } from '@/core/helpers'
import Loading from '@/components/loading'
import { KanbanContainerData, PaymentStatus } from '@/core/structures'
import Kanban from '@/components/kanban/kanban'
import CommissionFormSubmissionContent from '../submissions/commission-form-submission-content'
import CommissionInvoicing from '../../invoices/commission-invoicing'
import { useDashboardContext } from '@/components/navigation/dashboard/dashboard-context'
import { KanbanResponse } from '@/core/responses'

export default function DashboardCommissionDetailView({ slug, order_id }: { slug: string; order_id: string }) {
    const { artistId } = useDashboardContext()
    const { data, isLoading } = useSWR(
        `{
            form_submission(order_id: "${order_id}") {
                id
                content
                createdAt
                paymentStatus
                invoiceContent
                invoiceSent
                user {
                    name
                    find_customer_id(artist_id: "${artistId}") {
                        customerId
                        stripeAccount
                    }
                }
                form {
                    commission {
                        title
                        useInvoicing
                    }
                }
                kanban {
                    status
                    tasks {
                        id
                        content
                        container_id
                    }
                    containers {
                        id
                        title
                    }
                }
            }
        }`,
        GraphQLFetcher<{
            form_submission: {
                id: string
                content: string
                createdAt: Date
                paymentStatus: PaymentStatus
                invoiceContent: string
                invoiceSent: boolean
                user: {
                    name: string
                    find_customer_id: {
                        customerId: string
                        stripeAccount: string
                    }
                }
                form: {
                    commission: {
                        title: string
                        useInvoicing: boolean
                    }
                }
                kanban: KanbanResponse
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
                        <CommissionFormSubmissionContent content={data?.form_submission.content!} />
                    </div>
                </div>
                <div className="card bg-base-100 shadow-xl">
                    <div className="card-body">
                        <Kanban
                            title={data?.form_submission.form.commission.title!}
                            client={data?.form_submission.user.name!}
                            kanban_containers={data?.form_submission.kanban.containers!}
                            kanban_tasks={data?.form_submission.kanban.tasks!}
                        />
                    </div>
                </div>
                <div className="flex flex-grow gap-5 w-full">
                    {data?.form_submission.form.commission.useInvoicing && (
                        <div className="card bg-base-100 shadow-xl w-full">
                            <div className="card-body">
                                <h2 className="card-title">Invoicing</h2>
                                <div className="divider"></div>
                                <CommissionInvoicing
                                    submission_id={data.form_submission.id}
                                    customer_id={data.form_submission.user.find_customer_id.customerId}
                                    stripe_account={data.form_submission.user.find_customer_id.stripeAccount}
                                    invoice_content={data.form_submission.invoiceContent}
                                    invoice_sent={data.form_submission.invoiceSent}
                                />
                            </div>
                        </div>
                    )}
                    <div className="card bg-base-100 shadow-xl w-full">
                        <div className="card-body">
                            <h2 className="card-title">Messages</h2>
                            <div className="divider"></div>
                        </div>
                    </div>
                </div>
            </div>
        </DashboardContainer>
    )
}
