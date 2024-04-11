import { api } from '@/core/api/server'
import { Tabs } from '@/components/ui/tabs'

import DefaultPageLayout from '../(default)/layout'
import RequestTable from '@/components/ui/request-table'
import { CommissionStatus } from '@/core/structures'

export default async function DeliveryPage() {
    const requests = await api.user.get_requests()

    return (
        <DefaultPageLayout>
            <div className="card bg-base-300 shadow-xl">
                <div className="card-body">
                    <h2 className="card-title">My Requests</h2>
                    <div className="divider"></div>
                    <Tabs
                        tabs={[
                            {
                                title: 'All Requests',
                                value: 'allrequests',
                                content: <RequestTable requests={requests} />
                            },
                            {
                                title: 'Pending',
                                value: 'pending',
                                content: (
                                    <RequestTable
                                        requests={requests.filter(
                                            (request) =>
                                                request.status ===
                                                CommissionStatus.WaitingApproval
                                        )}
                                    />
                                )
                            },
                            {
                                title: 'In Progress',
                                value: 'inprogress',
                                content: (
                                    <RequestTable
                                        requests={requests.filter(
                                            (request) =>
                                                request.status ===
                                                CommissionStatus.Accepted
                                        )}
                                    />
                                )
                            },

                            {
                                title: 'Rejected',
                                value: 'rejected',
                                content: (
                                    <RequestTable
                                        requests={requests.filter(
                                            (request) =>
                                                request.status ===
                                                CommissionStatus.Rejected
                                        )}
                                    />
                                )
                            },
                            {
                                title: 'Delivered',
                                value: 'delivered',
                                content: (
                                    <RequestTable
                                        requests={requests.filter(
                                            (request) =>
                                                request.status ===
                                                CommissionStatus.Delivered
                                        )}
                                    />
                                )
                            }
                        ]}
                    />
                </div>
            </div>
        </DefaultPageLayout>
    )
}
