import FormCreateForm from '~/components/dashboard/forms/create-forms'
import DashboardContainer from '~/components/ui/dashboard-container'

export default function CreateFormsPage() {
    return (
        <DashboardContainer title="Create Form">
            <FormCreateForm />
        </DashboardContainer>
    )
}
