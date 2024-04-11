'use client'

import { useDashboardContext } from '@/components/navigation/dashboard/dashboard-context'

import DashboardContainer from '../dashboard-container'
import Loading from '@/components/loading'
import CommissionPublishButton from './requests/commission-publish-button'
import Link from 'next/link'
import { api } from '@/core/trpc/react'

import { Pie } from 'react-chartjs-2'
import { Chart as ChartJS, ArcElement, Tooltip, Legend, ChartData } from 'chart.js'
import { Tabs } from '@/components/ui/tabs'
import { usePathname } from 'next/navigation'
import RequestCard from './request-card'
import { CommissionStatus } from '@/core/structures'
import { ClipboardListIcon, PencilIcon } from 'lucide-react'

ChartJS.register(ArcElement, Tooltip, Legend)

export default function DashboardCommissionDetail({ slug }: { slug: string }) {
    const { artist } = useDashboardContext()!
    const { data, isLoading, refetch } = api.commissions.get_commission_data.useQuery({
        artist_id: artist?.id!,
        slug: slug
    })

    const pathname = usePathname()

    if (isLoading) {
        return (
            <DashboardContainer title="Nemu is searching...">
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
                        <ClipboardListIcon className="w-6 h-6" />
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
                <Tabs
                    containerClassName="bg-base-100 p-5 rounded-xl shadow-xl"
                    contentClassName="bg-base-100 card card-body shadow-xl"
                    tabs={[
                        {
                            title: 'New Requests',
                            value: 'new_requests',
                            content: (
                                <div className="flex flex-col gap-5">
                                    <h2 className="card-title">New Requests</h2>
                                    <div className="divider"></div>
                                    {data?.requests
                                        .filter(
                                            (request) =>
                                                request.status ===
                                                CommissionStatus.WaitingApproval
                                        )
                                        .map((request) => (
                                            <RequestCard
                                                refetch={refetch}
                                                data={request}
                                            />
                                        ))}
                                </div>
                            )
                        },
                        {
                            title: 'Active Requests',
                            value: 'active_requests',
                            content: (
                                <div className="flex flex-col gap-5">
                                    <h2 className="card-title">Active Requests</h2>
                                    <div className="divider"></div>
                                    {data?.requests
                                        .filter(
                                            (request) =>
                                                request.status ===
                                                CommissionStatus.Accepted
                                        )
                                        .map((request) => (
                                            <Link
                                                key={request.id}
                                                href={`/dashboard/commissions/${data.slug}/${request.orderId}`}
                                            >
                                                <div className="card bg-base-200 shadow-xl cursor-pointer">
                                                    <div className="card-body">
                                                        <h2 className="card-title">
                                                            {request.user.name}
                                                        </h2>
                                                        <span className="text-base-content/80">
                                                            {new Date(
                                                                data.createdAt
                                                            ).toDateString()}
                                                        </span>
                                                    </div>
                                                </div>
                                            </Link>
                                        ))}
                                </div>
                            )
                        },
                        {
                            title: 'Waitlisted Requests',
                            value: 'waitlisted_requests',
                            content: (
                                <div className="flex gap-5">
                                    <div></div>
                                </div>
                            )
                        },
                        {
                            title: 'Delivered',
                            value: 'delivered',
                            content: <>Waitlisted</>
                        }
                    ]}
                />
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
