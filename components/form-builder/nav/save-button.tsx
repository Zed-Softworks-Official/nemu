'use client'

import { useState } from 'react'
import { ArrowDownOnSquareStackIcon } from '@heroicons/react/20/solid'
import { DesignerContextType, useDesigner } from '../designer/designer-context'
import { CreateToastPromise } from '@/core/promise'

export default function SaveButton({ form_id }: { form_id: string }) {
    const { elements } = useDesigner() as DesignerContextType
    const [isSaving, setIsSaving] = useState(false)

    async function updateFormContext() {
        const JsonElements = JSON.stringify(elements)
        await CreateToastPromise(
            fetch(`/api/forms/${form_id}`, {
                method: 'post',
                body: JsonElements
            }),
            {
                pending: 'Saving Form',
                success: 'Form Saved'
            }
        )

        setIsSaving(false)
    }

    return (
        <button
            className="btn btn-primary"
            onClick={() => {
                setIsSaving(true)
                updateFormContext()
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
