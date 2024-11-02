import { CreateFormsForm } from '~/components/dashboard/forms/forms-form'

export default function CreateFormsPage() {
    return (
        <div className="container mx-auto px-5 py-10">
            <div className="mb-6 flex items-center justify-between">
                <h1 className="text-3xl font-bold">Create a new form</h1>
            </div>

            <CreateFormsForm />
        </div>
    )
}
