'use client'

import DashboardContainer from '../../dashboard-container'
import Loading from '@/components/loading'
import { KanbanContainerData, KanbanTask, PaymentStatus } from '@/core/structures'
import Kanban from '@/components/kanban/kanban'
import CommissionRequestContent from '../requests/commission-request-content'
import MessagesClient from '@/components/messages/messages-client'
import { Invoice, InvoiceItem } from '@prisma/client'
import CommissionInvoicing from '../../invoices/commission-invoicing'
import DownloadDropzone from '@/components/form/download-dropzone'
import { api } from '@/core/trpc/react'

export default function DashboardCommissionDetailView({
    slug,
    order_id
}: {
    slug: string
    order_id: string
}) {
    const { data: request, isLoading } = api.form.get_request.useQuery({
        order_id,
        include_invoice_items: true
    })

    if (isLoading) {
        return (
            <DashboardContainer title="" ignoreTitle>
                <Loading />
            </DashboardContainer>
        )
    }

    return (
        <DashboardContainer title={`Commission For ${request?.data.user.name}`}>
            <div className="flex flex-col gap-5">
                <div className="flex flex-grow gap-5 w-full">
                    <div className="card bg-base-100 shadow-xl w-full">
                        <div className="card-body">
                            <h2 className="card-title">Form Responses</h2>
                            <div className="divider"></div>
                            <CommissionRequestContent content={request?.data.content!} />
                        </div>
                    </div>
                    <div className="card bg-base-100 shadow-xl w-1/2">
                        <div className="card-body">
                            <h2 className="card-title">Invoicing</h2>
                            <div className="divider"></div>
                            <CommissionInvoicing
                                invoice_items={request?.invoice?.items as InvoiceItem[]}
                                invoice={request?.invoice as Invoice}
                            />
                        </div>
                    </div>
                    <div className="card bg-base-100 shadow-xl w-1/2">
                        <div className="card-body">
                            <h2 className="card-title">Create Download</h2>
                            <div className="divider"></div>
                            {request?.invoice?.paymentStatus == PaymentStatus.Captured ? (
                                <div className="h-full">
                                    <DownloadDropzone
                                        form_submission_id={request.data.id}
                                        commission_id={request.data.form.commissionId!}
                                        user_id={request.data.user.id}
                                        receipt_url={request.invoice.hostedUrl || ''}
                                    />
                                </div>
                            ) : (
                                <div className="flex flex-col justify-center items-center w-full h-full text-center">
                                    <h2 className="card-title">
                                        You'll be able to upload a file once the user has
                                        paid
                                    </h2>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                <div className="card bg-base-100 shadow-xl">
                    <div className="card-body">
                        {request && (
                            <Kanban
                                title={request?.data.form.commissionId!}
                                client={request?.data.user.name!}
                                kanban_containers={
                                    JSON.parse(
                                        request?.kanban?.containers!
                                    ) as KanbanContainerData[]
                                }
                                kanban_tasks={
                                    JSON.parse(request?.kanban?.tasks!) as KanbanTask[]
                                }
                                kanban_id={request.kanban?.id}
                            />
                        )}
                    </div>
                </div>
                <div className="card bg-base-100 shadow-xl w-full mx-auto">
                    <div className="card-body h-[60rem] overflow-hidden">
                        <h2 className="card-title">Messages</h2>
                        <div className="divider"></div>
                        <MessagesClient
                            hide_channel_list
                            channel_url={request?.data.sendbirdChannelURL!}
                        />
                    </div>
                </div>
            </div>
        </DashboardContainer>
    )
}
