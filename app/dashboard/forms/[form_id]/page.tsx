import DashboardContainer from '@/components/dashboard/dashboard-container'
import FormBuilder from '@/components/form-builder/form-builder'

export default function DashboardCommissionFormEditPage({
    params
}: {
    params: { form_id: string }
}) {
    return (
        <DashboardContainer title="Edit Commission Form">
            <FormBuilder form_id={params.form_id} />
        </DashboardContainer>
    )
}
