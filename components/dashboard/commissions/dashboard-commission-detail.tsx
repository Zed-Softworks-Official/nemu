'use client'

import { useDashboardContext } from '@/components/navigation/dashboard/dashboard-context'

import DashboardContainer from '../dashboard-container'
import CommissionFormSubmissions from '@/components/dashboard/commissions/submissions/commission-form-submissions'
import useSWR from 'swr'
import { GraphQLFetcher } from '@/core/helpers'
import Loading from '@/components/loading'
import ActiveCommissionFormSubmissions from './submissions/commission-form-submissions-active'
import { PaymentStatus } from '@/core/structures'

export default function DashboardCommissionDetail({ slug }: { slug: string }) {
    const { artistId } = useDashboardContext()
    const { data, isLoading } = useSWR(
        `{
            commission(artist_id:"${artistId}", slug: "${slug}") {
                title
                id
                formId
                get_form_data {
                    id
                    name
                    description
                    submissions
                    acceptedSubmissions
                    rejectedSubmissions
                    formSubmissions {
                        id
                        content
                        createdAt
                        paymentIntent
                        paymentStatus
                        orderId
                        user {
                            name
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
                useInvoicing: boolean
                get_form_data: {
                    id: string
                    name: string
                    description: string
                    submissions: number
                    acceptedSubmissions: number
                    rejectedSubmissions: number
                    formSubmissions: {
                        id: string
                        content: string
                        createdAt: Date
                        orderId: string
                        paymentIntent: string
                        paymentStatus: PaymentStatus
                        user: { name: string }
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
            <div className="flex gap-5 pb-5">
                <button type="button" className="btn btn-base-100">
                    Edit Commission Information
                </button>
                <button type="button" className="btn btn-base-100">
                    Edit Commission Form
                </button>
            </div>
            <div role="tabslist" className="tabs tabs-lifted">
                <input
                    type="radio"
                    name="dashboard_commission_tabs"
                    role="tab"
                    className="tab"
                    aria-label="Active Requests"
                    defaultChecked
                />
                <div role="tabpanel" className="tab-content bg-base-100 p-5 rounded-xl">
                    <ActiveCommissionFormSubmissions
                        commission_slug={slug}
                        form_submissions={data?.commission.get_form_data.formSubmissions!}
                    />
                </div>

                <input
                    type="radio"
                    name="dashboard_commission_tabs"
                    role="tab"
                    className="tab"
                    aria-label="Requests"
                />
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
