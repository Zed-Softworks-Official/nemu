import { api } from '@/core/trpc/server'
import { Tabs } from '@/components/ui/tabs'

import DefaultPageLayout from '../(default)/layout'
import RequestTable from '@/components/ui/request-table'

export default async function DeliveryPage() {
    const submissions = await api.user.get_submissions()

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
                                content: <RequestTable submissions={submissions} />
                            },
                            {
                                title: 'Pending',
                                value: 'pending',
                            },
                            {
                                title: 'Completed',
                                value: 'completed'
                            }
                        ]}
                    />
                </div>
            </div>
        </DefaultPageLayout>
    )
}
