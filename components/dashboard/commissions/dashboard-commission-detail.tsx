'use client'

import { useDashboardContext } from '@/components/navigation/dashboard/dashboard-context'

import DashboardContainer from '../dashboard-container'
import CommissionFormSubmissions from '@/components/dashboard/commissions/submissions/commission-form-submissions'
import useSWR from 'swr'
import { GraphQLFetcher } from '@/core/helpers'
import Loading from '@/components/loading'
import ActiveCommissionFormSubmissions from './submissions/commission-form-submissions-active'
import { PaymentStatus } from '@/core/structures'
import CommissionPublishButton from './submissions/commission-publish-button'
import { ClipboardDocumentListIcon, PencilIcon } from '@heroicons/react/20/solid'
import Link from 'next/link'
import { CommissionStatus } from '@/core/data-structures/form-structures'

export default function DashboardCommissionDetail({ slug }: { slug: string }) {
    const { artistId } = useDashboardContext()
    const { data, isLoading } = useSWR(
        `{
            commission(artist_id:"${artistId}", slug: "${slug}") {
                title
                id
                formId
                published
                useInvoicing
                get_form_data {
                    id
                    name
                    description
                    newSubmissions
                    acceptedSubmissions
                    rejectedSubmissions
                    formSubmissions {
                        id
                        content
                        createdAt
                        paymentIntent
                        paymentStatus
                        commissionStatus
                        orderId
                        user {
                            name
                            find_customer_id(artist_id: "${artistId}") {
                                customerId
                            }
                        }
                    }
                }
                artist {
                    stripeAccount
                }
            }
        }`,
        GraphQLFetcher<{
            commission: {
                title: string
                id: string
                formId: string
                published: boolean
                useInvoicing: boolean
                get_form_data: {
                    id: string
                    name: string
                    description: string
                    newSubmissions: number
                    acceptedSubmissions: number
                    rejectedSubmissions: number
                    formSubmissions: {
                        id: string
                        content: string
                        createdAt: Date
                        paymentIntent: string
                        paymentStatus: PaymentStatus
                        commissionStatus: CommissionStatus
                        orderId: string
                        user: {
                            name: string
                            find_customer_id: {
                                customerId: string
                            }
                        }
                    }[]
                }
                artist: {
                    stripeAccount: string
                }
            }
        }>
    )

    if (isLoading) {
        return (
            <DashboardContainer title="Nemu is searching..." ignoreTitle>
                <Loading />
            </DashboardContainer>
        )
    }

    return (
        <DashboardContainer title={data?.commission.title || 'Commission View'}>
            <div className="flex justify-between pb-5">
                <div className="flex gap-5">
                    <Link href={`/dashboard/commissions/${slug}/edit`} className="btn btn-base-100">
                        <PencilIcon className="w-6 h-6" />
                        Edit Commission
                    </Link>
                    <Link href={`/dashboard/forms/${data?.commission.formId}`} className="btn btn-base-100">
                        <ClipboardDocumentListIcon className="w-6 h-6" />
                        Edit Commission Form
                    </Link>
                </div>
                <div>
                    <CommissionPublishButton commission_id={data?.commission.id!} published={data?.commission.published!} />
                </div>
            </div>
            <div role="tabslist" className="tabs tabs-lifted">
                <input type="radio" name="dashboard_commission_tabs" role="tab" className="tab" aria-label="Active Requests" defaultChecked />
                <div role="tabpanel" className="tab-content bg-base-100 p-5 rounded-xl">
                    <ActiveCommissionFormSubmissions commission_slug={slug} form_submissions={data?.commission.get_form_data.formSubmissions!} />
                </div>

                <input type="radio" name="dashboard_commission_tabs" role="tab" className="tab" aria-label="Requests" />
                <div role="tabpanel" className="tab-content bg-base-100 p-5 rounded-xl">
                    <CommissionFormSubmissions
                        form_data={data?.commission.get_form_data!}
                        use_invoicing={data?.commission.useInvoicing!}
                        stripe_account={data?.commission.artist.stripeAccount!}
                    />
                </div>
            </div>
        </DashboardContainer>
    )
}
