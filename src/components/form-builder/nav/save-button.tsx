'use client'

import { SaveIcon } from 'lucide-react'

import { Button } from '~/components/ui/button'
import { useDesigner } from '~/components/form-builder/designer/designer-context'
import { useState } from 'react'
import { toast } from 'sonner'

import { set_form_content } from '~/server/actions/form'

export default function SaveButton({ form_id }: { form_id: string }) {
    const [pending, setPending] = useState(false)
    const { elements } = useDesigner()

    return (
        <Button
            onClick={async () => {
                setPending(true)
                const toast_id = toast.loading('Saving form')

                const res = await set_form_content(form_id, JSON.stringify(elements))

                if (!res.success) {
                    toast.error('Failed to save form', {
                        id: toast_id
                    })
                    setPending(false)
                    return
                }

                toast.success('Form saved!', {
                    id: toast_id
                })

                setPending(false)
            }}
            disabled={pending}
        >
            {pending ? (
                <span className="loading loading-spinner"></span>
            ) : (
                <SaveIcon className="h-6 w-6" />
            )}
            Save
        </Button>
    )
}
