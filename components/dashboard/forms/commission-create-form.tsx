'use client'

import TextArea from '@/components/form/text-area'
import TextInput from '@/components/form/text-input'
import { CreateToastPromise } from '@/helpers/toast-promise'

import { CheckCircleIcon } from '@heroicons/react/20/solid'
import { useSession } from 'next-auth/react'
import { FormEvent } from 'react'

export default function CommissionCreateForm() {
    const { data: session } = useSession()

    function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()

        const formData = new FormData(event.currentTarget)
        
        CreateToastPromise(
            fetch(`/api/artist/${session?.user.user_id}/forms`, {
                method: 'post',
                body: formData
            }),
            { pending: 'Creating Form', success: 'Form Created' }
        )
    }

    return (
        <form className="max-w-xl mx-auto" onSubmit={handleSubmit}>
            <TextInput
                label="Form Name"
                name="commission_form_name"
                placeholder="Enter your unique form name"
            />
            <TextArea
                label="Form Description"
                name="commission_form_desc"
                placeholder="Something to help you remember what this is for"
            />
            <button type="submit" className="btn btn-primary">
                <CheckCircleIcon className="w-6 h-6 inline-block mr-3" />
                Add Product
            </button>
        </form>
    )
}
