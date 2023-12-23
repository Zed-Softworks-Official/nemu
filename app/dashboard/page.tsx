import React from 'react'
import DashboardContainer from '@/components/dashboard/dashboard-container'
import Kanban from '@/components/kanban/kanban'

export default function Dashboard() {
    return (
        <DashboardContainer title="Artist's Dashboard">
            <div className="grid grid-cols-6 gap-5">
                <div className="bg-charcoal px-10 py-3 rounded-xl col-span-2">
                    <h1 className="font-bold">Artist&apos;s Corner</h1>
                </div>
                <div className="bg-charcoal px-10 py-3 rounded-xl col-span-2">
                    <h1 className="font-bold">New Commissions</h1>
                </div>
                <div className="bg-charcoal px-10 py-3 rounded-xl col-span-2">
                    <h1 className="font-bold">Recent Messages</h1>
                </div>
            </div>
            {/* <div className="flex flex-col bg-charcoal px-10 py-3 rounded-xl p-5 mt-5">
                <h1 className="font-bold">Kanban</h1>
                <Kanban title="Test Commission" client="GnarlyTiger" />
            </div> */}
        </DashboardContainer>
    )
}
