'use client'

import { useDashboardContext } from '@/components/navigation/dashboard/dashboard-context'

import DashboardContainer from '../dashboard-container'
import CommissionFormSubmissions from '@/components/form-builder/submissions/commission-form-submissions'
import useSWR from 'swr'
import { GraphQLFetcher } from '@/core/helpers'
import Loading from '@/components/loading'

export default function DashboardCommissionDetail({ slug }: { slug: string }) {
    const { artistId } = useDashboardContext()
    const { data, isLoading } = useSWR(
        `
    {
        commission(artist_id:"${artistId}", slug: "${slug}") {
            title
            id
            formId
        }
    }`,
        GraphQLFetcher<{
            commission: { title: string; id: string; formId: string }
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
                    aria-label="Current Commissions"
                    defaultChecked
                />
                <div role="tabpanel" className="tab-content bg-base-100 p-5 rounded-xl">
                    <h1>Hello, World!</h1>
                </div>

                <input
                    type="radio"
                    name="dashboard_commission_tabs"
                    role="tab"
                    className="tab"
                    aria-label="Requests"
                />
                <div role="tabpanel" className="tab-content bg-base-100 p-5 rounded-xl">
                    <CommissionFormSubmissions commission_id={data?.commission.id!} />
                </div>
            </div>
        </DashboardContainer>
    )
}
