'use client'

import { toast } from 'react-toastify'
import { SaveIcon } from 'lucide-react'

import { api } from '~/trpc/react'

import { Button } from '~/components/ui/button'
import { useDesigner } from '~/components/form-builder/designer/designer-context'

export default function SaveButton({ form_id }: { form_id: string }) {
    const { elements } = useDesigner()

    const mutation = api.form.set_form_content.useMutation({
        onSuccess: () => {
            toast('Form Updated!', { theme: 'dark', type: 'success' })
        },
        onError: () => {
            toast('Failed to update form!', { theme: 'dark', type: 'success' })
        }
    })

    return (
        <Button
            onClick={() => {
                mutation.mutate({
                    form_id,
                    content: JSON.stringify(elements)
                })
            }}
            disabled={mutation.isPending}
        >
            {mutation.isPending ? (
                <span className="loading loading-spinner"></span>
            ) : (
                <SaveIcon className="w-6 h-6" />
            )}
            Save
        </Button>
    )
}
