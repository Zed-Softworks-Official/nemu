import { eq } from 'drizzle-orm'
import { unstable_cache } from 'next/cache'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'

import { DesignerProvider } from '~/components/form-builder/designer/designer-context'
import { FormElementInstance } from '~/components/form-builder/elements/form-elements'
import FormBuilder from '~/components/form-builder/form-builder'
import DashboardContainer from '~/components/ui/dashboard-container'
import Loading from '~/components/ui/loading'
import { db } from '~/server/db'
import { forms } from '~/server/db/schema'

const get_form = unstable_cache(async (form_id: string) => {
    const form = await db.query.forms.findFirst({
        where: eq(forms.id, form_id)
    })

    if (!form) {
        return undefined
    }

    return form
})

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
