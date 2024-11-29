'use client'

import { notFound } from 'next/navigation'
// import { DesignerProvider } from '~/components/form-builder/designer/designer-context'
// import type { FormElementInstance } from '~/components/form-builder/elements/form-elements'

// import FormBuilder from '~/components/form-builder/form-builder'
import Loading from '~/components/ui/loading'
import { api } from '~/trpc/react'

export function FormBuilderElement(props: { id: string }) {
    const { data: form, isLoading } = api.request_form.get_form_by_id.useQuery({
        id: props.id
    })

    if (isLoading) {
        return <Loading />
    }

    if (!form) {
        return notFound()
    }

    return <pre>{JSON.stringify(form.content, null, 2)}</pre>

    // return (
    //     <DesignerProvider initial_elements={form.content as FormElementInstance[]}>
    //         <FormBuilder form={form} />
    //     </DesignerProvider>
    // )
}
