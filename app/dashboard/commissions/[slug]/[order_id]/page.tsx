import CommissionRequestContent from '@/components/dashboard/commissions/requests/commission-request-content'
import DashboardContainer from '@/components/dashboard/dashboard-container'
import CommissionInvoicing from '@/components/dashboard/invoices/commission-invoicing'
import DownloadDropzone from '@/components/form/download-dropzone'
import Kanban from '@/components/kanban/kanban'
import MessagesClient from '@/components/messages/messages-client'
import NemuImage from '@/components/nemu-image'
import { BentoGrid, BentoGridItem } from '@/components/ui/bento-grid'
import { Tabs } from '@/components/ui/tabs'
import { KanbanContainerData, KanbanTask, PaymentStatus } from '@/core/structures'
import { api } from '@/core/trpc/server'
import { Invoice, InvoiceItem } from '@prisma/client'
import { notFound } from 'next/navigation'

export default async function CommissionOrderDetail({
    params
}: {
    params: { slug: string; order_id: string }
}) {
    const request = await api.form.get_request({
        order_id: params.order_id,
        include_invoice_items: true
    })

    if (!request) {
        return notFound()
    }

    return (
        <DashboardContainer title={`Commission for ${request.data.user.name}`}>
            <Tabs
                tabs={[
                    {
                        title: 'Form Responses',
                        value: 'form_responses',
                        content: (
                            <>
                                <h2 className="card-title">Form Responses</h2>
                                <div className="divider"></div>
                                <CommissionRequestContent
                                    content={request.data.content}
                                />
                            </>
                        )
                    },
                    {
                        title: 'Invoice',
                        value: 'invoice',
                        content: (
                            <>
                                <h2 className="card-title">Invoice</h2>
                                <div className="divider"></div>
                                <CommissionInvoicing
                                    invoice={request.invoice as Invoice}
                                    invoice_items={
                                        request.invoice?.items as InvoiceItem[]
                                    }
                                />
                            </>
                        )
                    },
                    {
                        title: 'Delivery',
                        value: 'delivery',
                        content: (
                            <div className="flex flex-col gap-5">
                                {request.download && (
                                    <div className="flex flex-col justify-center items-center gap-5">
                                        <NemuImage
                                            src={'/nemu/sparkles.png'}
                                            alt="Nemu Excited"
                                            width={200}
                                            height={200}
                                        />
                                        <h2 className="card-title">
                                            Your commission has been delivered
                                        </h2>
                                    </div>
                                )}
                                {!request.download &&
                                    request.invoice?.paymentStatus ==
                                        PaymentStatus.InvoiceCreated && (
                                        <div className="h-full">
                                            <DownloadDropzone
                                                form_submission_id={request.data.id}
                                                commission_id={
                                                    request.data.form.commissionId!
                                                }
                                                user_id={request.data.user.id}
                                                receipt_url={
                                                    request.invoice.hostedUrl || ''
                                                }
                                            />
                                        </div>
                                    )}
                            </div>
                        )
                    }
                ]}
                containerClassName="card bg-base-100 shadow-xl card-body"
                contentClassName="card bg-base-100 shadow-xl card-body mb-5"
            />
            <BentoGrid className="w-full mx-auto">
                <BentoGridItem
                    disabledDivider
                    disabledDefaultPadding
                    className="col-span-full"
                    content={
                        <>
                            {request.kanban && (
                                <Kanban
                                    title={request.data.commission.title}
                                    client={request.data.user.name!}
                                    kanban_containers={
                                        JSON.parse(
                                            request.kanban.containers!
                                        ) as KanbanContainerData[]
                                    }
                                    kanban_tasks={
                                        JSON.parse(request.kanban.tasks!) as KanbanTask[]
                                    }
                                    kanban_id={request.kanban.id}
                                />
                            )}
                        </>
                    }
                />
                <BentoGridItem
                    disabledDivider
                    disabledDefaultPadding
                    className="col-span-full"
                    content={
                        <MessagesClient
                            hide_channel_list
                            channel_url={request?.data.sendbirdChannelURL!}
                        />
                    }
                />
            </BentoGrid>
        </DashboardContainer>
    )
}
