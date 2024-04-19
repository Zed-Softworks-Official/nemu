import { notFound, redirect } from 'next/navigation'
import { DesignerProvider } from '~/components/form-builder/designer/designer-context'
import FormBuilder from '~/components/form-builder/form-builder'
import DashboardContainer from '~/components/ui/dashboard-container'
import { getServerAuthSession } from '~/server/auth'
import { api } from '~/trpc/server'

export default async function FormBuilderPage({ params }: { params: { id: string } }) {
    const session = await getServerAuthSession()

    if (!session || !session.user.artist_id) {
        return redirect('/u/login')
    }

    const form = await api.form.get_form({
        artist_id: session.user.artist_id,
        form_id: params.id
    })

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
