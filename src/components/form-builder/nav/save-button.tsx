'use client'

import { SaveIcon } from 'lucide-react'

import { api } from '~/trpc/react'

import { Button } from '~/components/ui/button'
import { useDesigner } from '~/components/form-builder/designer/designer-context'
import { useState } from 'react'
import { toast } from 'sonner'

export default function SaveButton({ form_id }: { form_id: string }) {
    const [toastId, setToastId] = useState<string | number | undefined>(undefined)
    const { elements } = useDesigner()

    const mutation = api.form.set_form_content.useMutation({
        onMutate: () => {
            setToastId(toast.loading('Creating forms'))
        },
        onSuccess: () => {
            toast.success('Form Saved!', {
                id: toastId
            })
        },
        onError: (e) => {
            toast.error(e.message, {
                id: toastId
            })
        }
    })

    return (
        <Button
            onMouseDown={() => {
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
                <SaveIcon className="h-6 w-6" />
            )}
            Save
        </Button>
    )
}
