'use client'

import { notFound } from 'next/navigation'
import DesignerProvider from '~/app/_components/form-builder/designer/designer-context'
import { FormBuilder } from '~/app/_components/form-builder/form-builder'
// import { type FormElementInstance } from '~/components/form-builder/form-elements'

import Loading from '~/app/_components/ui/loading'
import { api } from '~/trpc/react'

export function FormBuilderElement(props: { id: string }) {
    const { data: form, isLoading } = api.request.getFormById.useQuery({
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
