import { CommissionStatus, GraphQLFormSubmissionStructure } from '@/core/data-structures/form-structures'
import CommissionFormSubmissionDisplay from './commission-form-submission-display'
import { Commission, Form } from '@prisma/client'

import { Pie } from 'react-chartjs-2'
import { Chart as ChartJS, ArcElement, Tooltip, Legend, ChartData } from 'chart.js'

ChartJS.register(ArcElement, Tooltip, Legend)

export default function CommissionFormSubmissions({
    form_data,
    commission,
    stripe_account
}: {
    form_data: Form & {
        formSubmissions: GraphQLFormSubmissionStructure[]
    }
    commission: Commission
    stripe_account: string
}) {
    const data: ChartData<'pie', number[], string> = {
        labels: ['New', 'Accepted', 'Rejected'],
        datasets: [
            {
                label: 'requests',
                data: [form_data.newSubmissions, form_data.acceptedSubmissions, form_data.rejectedSubmissions],
                backgroundColor: ['#2185d5', '#1ece53', '#d82750'],
                borderColor: ['#1B72BA', '#169e3e', '#aa1e3f'],
                borderWidth: 1
            }
        ]
    }

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
                <div className="flex flex-col gap-5 w-full max-w-sm mx-auto justify-center items-center p-5">
                    <h2 className="card-title">Total Requests: {form_data.submissions}</h2>
                    <Pie data={data} options={{ color: '#f3f3f3' }} />
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
                        {form_data.formSubmissions?.map((submission) => (
                            <>
                                {submission.commissionStatus == CommissionStatus.WaitingApproval && (
                                    <CommissionFormSubmissionDisplay
                                        commission={commission}
                                        submission={submission}
                                        stripe_account={stripe_account}
                                    />
                                )}
                            </>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
