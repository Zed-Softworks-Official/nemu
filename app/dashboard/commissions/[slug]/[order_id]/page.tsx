import DashboardCommissionDetailView from '@/components/dashboard/commissions/detail/commission-detail-view'

export default function CommissionOrderDetail({
    params
}: {
    params: { slug: string; order_id: string }
}) {
    return <DashboardCommissionDetailView slug={params.slug} order_id={params.order_id} />
}
