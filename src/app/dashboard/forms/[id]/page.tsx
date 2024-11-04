import { notFound } from 'next/navigation'
import { Suspense } from 'react'

import { DesignerProvider } from '~/components/form-builder/designer/designer-context'
import type { FormElementInstance } from '~/components/form-builder/elements/form-elements'
import Loading from '~/components/ui/loading'
import { get_form } from '~/server/db/query'
import FormBuilder from '~/components/form-builder/form-builder'

export default async function FormBuilderPage(props: {
    params: Promise<{ id: string }>
}) {
    const params = await props.params

    return (
        <div className="container mx-auto p-10">
            <Suspense fallback={<Loading />}>
                <PageContent id={params.id} />
            </Suspense>
        </div>
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
