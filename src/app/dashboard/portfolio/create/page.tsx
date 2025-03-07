import { CreateForm } from '../form'

export default function DashboardPortfolioCreatePage() {
    return (
        <div className="container mx-auto max-w-4xl px-5 py-10">
            <h1 className="mb-6 text-3xl font-bold">Create Portfolio Item</h1>

            <CreateForm />
        </div>
    )
}
