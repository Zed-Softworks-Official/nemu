'use client'

import { SaveIcon } from 'lucide-react'

import { api } from '~/trpc/react'

import { Button } from '~/components/ui/button'
import { useDesigner } from '~/components/form-builder/designer/designer-context'
import { nemu_toast } from '~/lib/utils'
import { useTheme } from 'next-themes'

export default function SaveButton({ form_id }: { form_id: string }) {
    const { elements } = useDesigner()
    const { resolvedTheme } = useTheme()

    const mutation = api.form.set_form_content.useMutation({
        onSuccess: () => {
            nemu_toast('Form Updated!', { theme: resolvedTheme, type: 'success' })
        },
        onError: () => {
            nemu_toast('Failed to update form!', { theme: resolvedTheme, type: 'error' })
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
