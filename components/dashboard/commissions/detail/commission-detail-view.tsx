'use client'

import useSWR from 'swr'
import DashboardContainer from '../../dashboard-container'
import { GraphQLFetcher } from '@/core/helpers'
import Loading from '@/components/loading'
import { PaymentStatus } from '@/core/structures'
import Kanban from '@/components/kanban/kanban'
import CommissionFormSubmissionContent from '../submissions/commission-form-submission-content'
import CommissionInvoicing from '../../invoices/commission-invoicing'
import { useDashboardContext } from '@/components/navigation/dashboard/dashboard-context'
import { KanbanResponse } from '@/core/responses'
import MessagesClient from '@/components/messages/messages-client'
import DownloadDropzone from '@/components/form/download-dropzone'

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
                sendbirdChannelURL
                user {
                    id
                    name
                    find_customer_id(artist_id: "${artistId}") {
                        customerId
                        stripeAccount
                    }
                }
                form {
                    commission {
                        id
                        title
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
                sendbirdChannelURL: string
                user: {
                    id: string
                    name: string
                    find_customer_id: {
                        customerId: string
                        stripeAccount: string
                    }
                }
                form: {
                    commission: {
                        id: string
                        title: string
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
                <div className="flex flex-grow gap-5 w-full">
                    <div className="card bg-base-100 shadow-xl w-full">
                        <div className="card-body">
                            <h2 className="card-title">Form Responses</h2>
                            <div className="divider"></div>
                            <CommissionFormSubmissionContent content={data?.form_submission.content} />
                        </div>
                    </div>
                    <div className="card bg-base-100 shadow-xl w-1/2">
                        <div className="card-body">
                            <h2 className="card-title">Invoicing</h2>
                            <div className="divider"></div>
                            <CommissionInvoicing
                                submission_id={data?.form_submission.id!}
                                customer_id={data?.form_submission.user.find_customer_id.customerId!}
                                stripe_account={data?.form_submission.user.find_customer_id.stripeAccount!}
                                invoice_content={data?.form_submission.invoiceContent!}
                                invoice_sent={data?.form_submission.invoiceSent!}
                            />
                        </div>
                    </div>
                    <div className="card bg-base-100 shadow-xl w-1/2">
                        <div className="card-body">
                            <h2 className="card-title">Create Download</h2>
                            <div className="divider"></div>
                            {data?.form_submission.paymentStatus == PaymentStatus.Captured ? (
                                <div className="h-full">
                                    <DownloadDropzone
                                        form_submission_id={data.form_submission.id}
                                        commission_id={data.form_submission.form.commission.id}
                                        user_id={data.form_submission.user.id}
                                    />
                                </div>
                            ) : (
                                <div className="flex flex-col justify-center items-center w-full h-full text-center">
                                    <h2 className="card-title">You'll be able to upload a file once the user has paid</h2>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                <div className="card bg-base-100 shadow-xl">
                    <div className="card-body">
                        {data && (
                            <Kanban
                                title={data?.form_submission.form.commission.title}
                                client={data?.form_submission.user.name}
                                kanban_containers={data?.form_submission.kanban.containers!}
                                kanban_tasks={data?.form_submission.kanban.tasks!}
                                submission_id={data?.form_submission.id}
                            />
                        )}
                    </div>
                </div>
                <div className="card bg-base-100 shadow-xl w-full mx-auto">
                    <div className="card-body h-[60rem] overflow-hidden">
                        <h2 className="card-title">Messages</h2>
                        <div className="divider"></div>
                        <MessagesClient hide_channel_list channel_url={data?.form_submission.sendbirdChannelURL} />
                    </div>
                </div>
            </div>
        </DashboardContainer>
    )
}
