import { currentUser } from '@clerk/nextjs/server'
import { notFound, redirect } from 'next/navigation'
import { DesignerProvider } from '~/components/form-builder/designer/designer-context'
import FormBuilder from '~/components/form-builder/form-builder'
import DashboardContainer from '~/components/ui/dashboard-container'
import { api } from '~/trpc/server'

export default async function FormBuilderPage({ params }: { params: { id: string } }) {
    const form = await api.form.get_form(params.id)

    if (!form) {
        return notFound()
    }

    return (
        <DashboardContainer title="Edit Form">
            <DesignerProvider initial_elements={JSON.parse(form.content)}>
                <FormBuilder form={form} />
            </DesignerProvider>
        </DashboardContainer>
    )
}
