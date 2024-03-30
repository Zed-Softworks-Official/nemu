'use client'

import { useState } from 'react'
import { ArrowDownOnSquareStackIcon } from '@heroicons/react/20/solid'
import { DesignerContextType, useDesigner } from '../designer/designer-context'
import { api } from '@/core/trpc/react'
import { toast } from 'react-toastify'

export default function SaveButton({ form_id }: { form_id: string }) {
    const { elements } = useDesigner() as DesignerContextType
    const [isSaving, setIsSaving] = useState(false)
    const mutation = api.form.set_form_content.useMutation({
        onSuccess: () => {
            toast('Form Updated!', { theme: 'dark', type: 'success' })
            setIsSaving(false)
        },
        onError: () => {
            toast('Failed to update form!', { theme: 'dark', type: 'success' })
        }
    })

    async function UpdateFormContext() {
        const JsonElements = JSON.stringify(elements)

        mutation.mutate({
            form_id,
            content: JsonElements
        })
    }

    return (
        <button
            className="btn btn-primary"
            onClick={() => {
                setIsSaving(true)
                UpdateFormContext()
            }}
            disabled={isSaving}
        >
            {isSaving ? (
                <span className="loading loading-spinner"></span>
            ) : (
                <ArrowDownOnSquareStackIcon className="w-6 h-6" />
            )}
            Save
        </button>
    )
}
