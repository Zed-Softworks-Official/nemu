import ViewAvailableInvoices from '@/components/dashboard/invoices/view-available-invoices'
import DefaultPageLayout from '../(default)/layout'

export default async function InvoicesPage() {
    return (
        <DefaultPageLayout>
            <div className="card bg-base-300 shadow-xl">
                <div className="card-body">
                    <h2 className="card-title">Invoices</h2>
                    <div className="divider"></div>
                    <ViewAvailableInvoices />
                </div>
            </div>
        </DefaultPageLayout>
    )
}
