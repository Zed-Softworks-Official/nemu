'use client'

import { notFound } from 'next/navigation'
import DesignerProvider from '~/components/form-builder/designer/designer-context'
import { FormBuilder } from '~/components/form-builder/form-builder'
// import { type FormElementInstance } from '~/components/form-builder/form-elements'

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

    return (
        <DesignerProvider>
            <FormBuilder form={form} />
        </DesignerProvider>
    )
}
