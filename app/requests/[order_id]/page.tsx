import DefaultPageLayout from '@/app/(default)/layout'
import CommissionRequestContent from '@/components/dashboard/commissions/requests/commission-request-content'
import MessagesClient from '@/components/messages/messages-client'
import ReviewForm from '@/components/review/review-form'
import { Tabs } from '@/components/ui/tabs'
import { ConvertCommissionStatusToBadge } from '@/core/react-helpers'
import { CommissionStatus, PaymentStatus } from '@/core/structures'
import { api } from '@/core/trpc/server'
import { faJar } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { ReceiptTextIcon } from 'lucide-react'
import { Metadata, ResolvingMetadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

type Props = {
    params: { order_id: string }
}

export async function generateMetadata(
    { params }: Props,
    parent: ResolvingMetadata
): Promise<Metadata> {
    const request = await api.form.get_request({ order_id: params.order_id })

    return {
        title: `Nemu | ${request?.data.commission.title} Request`
    }
}

export default async function OrderPage({ params }: Props) {
    const request = await api.form.get_request({ order_id: params.order_id })

    if (!request) {
        return notFound()
    }

    return (
        <DefaultPageLayout>
            <div className="flex gap-5 w-full justify-between">
                <div className="card shadow-xl bg-base-300 w-full h-fit">
                    <div className="card-body">
                        <div className="flex justify-between">
                            <div className="flex flex-col gap-2">
                                <h2 className="card-title">
                                    {request?.data.commission?.title}
                                </h2>
                                <p>
                                    By{' '}
                                    <Link
                                        href={`/@${request.data.commission.artist.handle}`}
                                        className="link link-hover"
                                    >
                                        @{request?.data.commission.artist.handle}
                                    </Link>
                                </p>
                            </div>
                            {ConvertCommissionStatusToBadge(request.data.status)}
                        </div>
                        <div className="divider"></div>
                        <Tabs
                            containerClassName="bg-base-200 p-5 rounded-xl shadow-xl"
                            tabs={[
                                {
                                    title: 'Details',
                                    value: 'details',
                                    content: (
                                        <div className="card bg-base-200 shadow-xl">
                                            <div className="card-body">
                                                <h2 className="card-title">
                                                    General Details
                                                </h2>
                                                <div className="divider"></div>
                                                <CommissionRequestContent
                                                    content={request.data.content}
                                                    classNames="bg-base-100"
                                                />
                                                {request.data.status ===
                                                    CommissionStatus.Delivered && (
                                                    <>
                                                        <h2 className="card-title mt-5">
                                                            Leave a review
                                                        </h2>
                                                        <div className="divider"></div>
                                                        <ReviewForm
                                                            request_id={request.data.id}
                                                            commission_id={
                                                                request.data.commissionId
                                                            }
                                                        />
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    )
                                },
                                {
                                    title: 'Messages',
                                    value: 'messages',
                                    content: (
                                        <div className="card bg-base-200 shadow-xl">
                                            <div className="card-body">
                                                <h2 className="card-title">Messages</h2>
                                                <div className="divider"></div>
                                                <MessagesClient
                                                    hide_channel_list
                                                    channel_url={
                                                        request.data.sendbirdChannelURL ||
                                                        ''
                                                    }
                                                />
                                            </div>
                                        </div>
                                    )
                                },
                                {
                                    title: 'Delivery',
                                    value: 'delivery',
                                    content: (
                                        <div className="card bg-base-300 shadow-xl">
                                            <div className="card-body">
                                                <h2>Nothing here yet!</h2>
                                            </div>
                                        </div>
                                    )
                                }
                            ]}
                        />
                    </div>
                </div>
                <div className="flex flex-col gap-5 max-w-80 w-full">
                    {request.invoice && (
                        <div className="card shadow-xl bg-base-300">
                            <div className="card-body">
                                <div className="flex gap-5 items-center">
                                    <ReceiptTextIcon className="w-6 h-6" />
                                    <h2 className="card-title">
                                        Invoice{' '}
                                        {request.invoice.paymentStatus ==
                                        PaymentStatus.InvoiceNeedsPayment ? (
                                            <span className="badge badge-error badge-lg">
                                                Unpaid
                                            </span>
                                        ) : (
                                            request.invoice.paymentStatus ==
                                                PaymentStatus.Captured && (
                                                <span className="badge badge-success badge-lg">
                                                    Paid
                                                </span>
                                            )
                                        )}
                                    </h2>
                                </div>
                                <div className="divider"></div>
                                {request.invoice.hostedUrl ? (
                                    <Link
                                        href={request.invoice.hostedUrl}
                                        target="_blank"
                                        className="btn btn-primary"
                                    >
                                        {request.invoice.paymentStatus ==
                                        PaymentStatus.InvoiceNeedsPayment
                                            ? 'Pay Invoice'
                                            : request.invoice.paymentStatus ==
                                                  PaymentStatus.Captured &&
                                              'View Invoice'}
                                    </Link>
                                ) : (
                                    <span>We're still waiting on that for you!</span>
                                )}
                            </div>
                        </div>
                    )}
                    {request.download && (
                        <div className="card shadow-xl bg-base-300">
                            <div className="card-body">
                                <h2 className="card-title">Download</h2>
                                <div className="divider"></div>
                                <Link
                                    href={request.download.fileKey}
                                    className="btn btn-primary"
                                >
                                    {request.download.fileKey}
                                </Link>
                            </div>
                        </div>
                    )}
                    {request.data.status === CommissionStatus.Delivered &&
                        request.data.commission.artist.tipJarUrl && (
                            <div className="card bg-base-300 shadow-xl">
                                <div className="card-body">
                                    <div className="flex gap-5">
                                        <FontAwesomeIcon
                                            icon={faJar}
                                            className="w-6 h-6"
                                        />
                                        <h2 className="card-title">Tip Jar</h2>
                                    </div>
                                    <div className="divider"></div>
                                    <span className="italic text-base-content/80">
                                        Want to give an extra for the artists hard work?
                                    </span>
                                    <Link
                                        href={request.data.commission.artist.tipJarUrl}
                                        className="btn btn-primary"
                                    >
                                        Tip Here
                                    </Link>
                                </div>
                            </div>
                        )}
                </div>
            </div>
        </DefaultPageLayout>
    )
}
