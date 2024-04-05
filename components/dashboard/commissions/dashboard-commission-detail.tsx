'use client'

import { useDashboardContext } from '@/components/navigation/dashboard/dashboard-context'

import DashboardContainer from '../dashboard-container'
import Loading from '@/components/loading'
import CommissionPublishButton from './submissions/commission-publish-button'
import { ClipboardDocumentListIcon, PencilIcon } from '@heroicons/react/20/solid'
import Link from 'next/link'
import { api } from '@/core/trpc/react'

import { Pie } from 'react-chartjs-2'
import { Chart as ChartJS, ArcElement, Tooltip, Legend, ChartData } from 'chart.js'
import Kanban from '@/components/kanban/kanban'

ChartJS.register(ArcElement, Tooltip, Legend)

export default function DashboardCommissionDetail({ slug }: { slug: string }) {
    const { artist } = useDashboardContext()!
    const { data, isLoading } = api.commissions.get_commission_data.useQuery({
        artist_id: artist?.id!,
        slug: slug
    })

    if (isLoading) {
        return (
            <DashboardContainer title="Nemu is searching..." ignoreTitle>
                <Loading />
            </DashboardContainer>
        )
    }

    const chart_data: ChartData<'pie', number[], string> = {
        labels: ['New', 'Accepted', 'Rejected'],
        datasets: [
            {
                label: 'requests',
                data: [
                    data?.form?.newSubmissions!,
                    data?.form?.acceptedSubmissions!,
                    data?.form?.rejectedSubmissions!
                ],
                backgroundColor: ['#2185d5', '#1ece53', '#d82750'],
                borderColor: ['#1B72BA', '#169e3e', '#aa1e3f'],
                borderWidth: 1
            }
        ]
    }

    return (
        <DashboardContainer title={data?.title || 'Commission View'}>
            <div className="flex justify-between pb-5">
                <div className="flex gap-5">
                    <Link
                        href={`/dashboard/commissions/${slug}/edit`}
                        className="btn btn-base-100"
                    >
                        <PencilIcon className="w-6 h-6" />
                        Edit Commission
                    </Link>
                    <Link
                        href={`/dashboard/forms/${data?.formId}`}
                        className="btn btn-base-100"
                    >
                        <ClipboardDocumentListIcon className="w-6 h-6" />
                        Edit Commission Form
                    </Link>
                </div>
                <div>
                    <CommissionPublishButton
                        commission_id={data?.id!}
                        published={data?.published!}
                    />
                </div>
            </div>
            <div className="flex flex-col gap-5">
                <div role="tabslist" className="tabs tabs-lifted">
                    <input
                        type="radio"
                        name="dashboard_commission_tabs"
                        role="tab"
                        className="tab"
                        aria-label="Requests"
                        defaultChecked
                    />
                    <div
                        role="tabpanel"
                        className="tab-content bg-base-100 p-5 rounded-xl"
                    >
                        <Kanban
                            kanban_containers={data?.containers!}
                            kanban_tasks={data?.tasks!}
                            header={
                                <div>
                                    <h2 className="card-title">Requests</h2>
                                </div>
                            }

                            requests={data?.formId}
                            disable_user_saving
                            disable_container_editing
                            disable_item_editing
                        />
                    </div>

                    <input
                        type="radio"
                        name="dashboard_commission_tabs"
                        role="tab"
                        className="tab"
                        aria-label="Delivered"
                    />
                    <div
                        role="tabpanel"
                        className="tab-content bg-base-100 p-5 rounded-xl"
                    ></div>
                </div>
                <div className="bg-base-100 card shadow-xl">
                    <div className="card-body">
                        <h2 className="card-title">Commission Stats</h2>
                        <div className="divider"></div>
                        <div className="flex flex-col gap-5 w-full max-w-sm mx-auto justify-center items-center p-5">
                            <h2 className="card-title">
                                Total Requests: {data?.form?.submissions}
                            </h2>
                            <Pie data={chart_data} options={{ color: '#f3f3f3' }} />
                        </div>
                    </div>
                </div>
            </div>
        </DashboardContainer>
    )
}
