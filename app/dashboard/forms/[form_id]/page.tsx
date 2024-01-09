import DashboardContainer from '@/components/dashboard/dashboard-container'
import { DesignerProvider } from '@/components/form-builder/designer/designer-context'
import FormBuilder from '@/components/form-builder/form-builder'

export default function DashboardCommissionFormEditPage({
    params
}: {
    params: { form_id: string }
}) {
    return (
        <DashboardContainer title="Edit Commission Form">
            <DesignerProvider>
                <FormBuilder form_id={params.form_id} />
            </DesignerProvider>
        </DashboardContainer>
    )
}
