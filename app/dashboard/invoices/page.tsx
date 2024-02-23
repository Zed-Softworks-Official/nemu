import DashboardContainer from '@/components/dashboard/dashboard-container'
import ViewAvailableInvoices from '@/components/dashboard/invoices/view-available-invoices'

export default function DashboardOrdersPage() {
    return (
        <DashboardContainer title="Available Invoices">
            <ViewAvailableInvoices />
        </DashboardContainer>
    )
}
