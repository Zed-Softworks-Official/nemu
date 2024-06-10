import { notFound } from 'next/navigation'
import { Suspense } from 'react'

import { DesignerProvider } from '~/components/form-builder/designer/designer-context'
import { FormElementInstance } from '~/components/form-builder/elements/form-elements'
import FormBuilder from '~/components/form-builder/form-builder'
import DashboardContainer from '~/components/ui/dashboard-container'
import Loading from '~/components/ui/loading'
import { get_form } from '~/server/db/query'

export default function FormBuilderPage({ params }: { params: { id: string } }) {
    return (
        <DashboardContainer title="Edit Form">
            <Suspense fallback={<Loading />}>
                <PageContent id={params.id} />
            </Suspense>
        </DashboardContainer>
    )
}

async function PageContent(props: { id: string }) {
    const form = await get_form(props.id)

    if (!form) {
        return notFound()
    }

    return (
        <DesignerProvider initial_elements={form.content as FormElementInstance[]}>
            <FormBuilder form={form} />
        </DesignerProvider>
    )
}
