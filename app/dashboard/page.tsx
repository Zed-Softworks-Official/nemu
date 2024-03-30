import DashboardContainer from '@/components/dashboard/dashboard-container'

export default function Dashboard() {
    return (
        <DashboardContainer title="Artist's Dashboard">
            <div className="grid grid-cols-6 gap-5 pb-5">
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
        </DashboardContainer>
    )
}
