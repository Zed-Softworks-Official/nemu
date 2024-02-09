import DashboardCommissionDetail from '@/components/dashboard/commissions/dashboard-commission-detail'

export default function CommissionsOverviewPage({params}: {params: {slug: string}}) {
    return <DashboardCommissionDetail slug={params.slug} /> 
}
