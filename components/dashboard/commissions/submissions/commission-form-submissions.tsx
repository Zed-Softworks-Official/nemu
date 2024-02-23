import { CommissionStatus } from '@/core/data-structures/form-structures'
import CommissionFormSubmissionDisplay from './commission-form-submission-display'
import { PaymentStatus } from '@/core/structures'

export default function CommissionFormSubmissions({
    form_data,
    use_invoicing,
    stripe_account
}: {
    form_data: {
        id: string
        name: string
        description: string
        newSubmissions: number
        acceptedSubmissions: number
        rejectedSubmissions: number
        formSubmissions: {
            id: string
            content: string
            createdAt: Date
            orderId: string
            paymentIntent: string
            paymentStatus: PaymentStatus
            commissionStatus: CommissionStatus
            user: { name: string; find_customer_id: { customerId: string } }
        }[]
    }
    use_invoicing: boolean
    stripe_account: string
}) {
    return (
        <div className="bg-base-300 rounded-xl">
            <div className="flex justify-between card">
                <div className="card-body">
                    <h1 className="card-title font-bold">Form Used: {form_data.name}</h1>
                    <h2 className="font-bold text-base-content/80">Description: {form_data.description}</h2>
                </div>
            </div>
            <div className="divider"></div>
            <div className="overflow-x-auto pb-28">
                <div className="grid grid-cols-3 gap-5 w-full p-5">
                    <div className="card bg-base-100 max-w-md shadow-xl border-primary border-2 mx-auto w-full">
                        <div className="card-body">
                            <h2 className="card-title pt-3">New Requests: {form_data.newSubmissions}</h2>
                        </div>
                    </div>
                    <div className="card bg-base-100 max-w-md shadow-xl border-success border-2 mx-auto w-full">
                        <div className="card-body">
                            <h2 className="card-title pt-3">Accepted: {form_data.acceptedSubmissions}</h2>
                        </div>
                    </div>
                    <div className="card bg-base-100 max-w-md shadow-xl border-error border-2 mx-auto w-full">
                        <div className="card-body">
                            <h2 className="card-title pt-3">Rejected: {form_data.rejectedSubmissions}</h2>
                        </div>
                    </div>
                </div>
                <div className="divider"></div>
                <table className="table table-zebra bg-base-100 max-w-7xl mx-auto">
                    <thead>
                        <tr>
                            <th>Username</th>
                            <th>Date Submitted</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {form_data.formSubmissions?.map(
                            (submission) =>
                                submission.commissionStatus == CommissionStatus.WaitingApproval && (
                                    <CommissionFormSubmissionDisplay
                                        submission={submission}
                                        form_id={form_data.id}
                                        stripe_account={stripe_account}
                                        use_invoicing={use_invoicing}
                                    />
                                )
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
