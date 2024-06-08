'use client'

import { ArrowLeftCircleIcon } from 'lucide-react'
import { useCallback, useRef, useState, useTransition } from 'react'

import NemuImage from '~/components/nemu-image'

import {
    FormElementInstance,
    FormElements
} from '~/components/form-builder/elements/form-elements'

import { api } from '~/trpc/react'
import { Button } from '~/components/ui/button'
import { toast } from 'sonner'
import { InferSelectModel } from 'drizzle-orm'
import { forms } from '~/server/db/schema'

export default function RequestSubmitForm({
    setShowForm,
    user_requested,
    commission_id,
    form_data
}: {
    setShowForm: (show: boolean) => void
    form_data: InferSelectModel<typeof forms>
    user_requested: boolean
    commission_id: string
}) {
    // Mutation to submit the form
    const mutation = api.requests.set_request.useMutation({
        onSuccess: () => {
            toast.success('Commission Request Submitted!')

            setSubmitted(true)
        },
        onError: () => {
            toast.error('Commission request could not be submitted!')
        }
    })

    // Form values and errors
    const formValues = useRef<{ [key: string]: string }>({})
    const formErrors = useRef<{ [key: string]: boolean }>({})

    // Key to re-render the form and submitted state and user form data
    const [renderKey, setRenderKey] = useState(new Date().getTime())
    const [submitted, setSubmitted] = useState(false)
    const [formData, setFormData] = useState<{
        [key: string]: { value: string; label: string }
    }>({})

    const [pending, startTransition] = useTransition()

    // Submit a value to the form
    const submitValue = useCallback((key: string, value: string) => {
        formErrors.current = {}
        formValues.current[key] = value
    }, [])

    // Handles the form submission to the server
    async function submitForm() {
        const validForm = validateForm()
        if (!validForm) {
            setRenderKey(new Date().getTime())
            toast.error('Please check all required fields!')

            return
        }

        const newFormData: { [key: string]: { value: string; label: string } } = {}
        const formElements = form_data?.content as FormElementInstance[]
        for (let key in formValues.current) {
            newFormData[key] = {
                value: formValues.current[key]!,
                label: formElements.find((element) => element.id == key)?.extra_attributes
                    ?.label
            }
        }

        mutation.mutate({
            form_id: form_data.id,
            commission_id,
            content: JSON.stringify(newFormData)
        })

        setFormData(newFormData)
    }

    // Validate the form
    const validateForm: () => boolean = useCallback(() => {
        for (const field of form_data?.content as FormElementInstance[]) {
            const actualValue = formValues.current[field.id] || ''
            const valid = FormElements[field.type].validate(field, actualValue)

            if (!valid) {
                formErrors.current[field.id] = true
            }
        }

        if (Object.keys(formErrors.current).length > 0) {
            return false
        }

        return true
    }, [form_data?.content])

    // If the form has been submitted then show the success message
    if (submitted) {
        return (
            <div className="mx-auto h-full max-w-xl">
                <div className="flex h-full w-full flex-col items-center justify-center gap-5 p-5 text-center">
                    <NemuImage
                        src={'/nemu/sparkles.png'}
                        alt="Nemu Excited"
                        width={200}
                        height={200}
                        priority
                    />

                    <h2 className="text-2xl font-bold">Things are happening!</h2>
                    <p className="italic text-base-content/80">
                        You'll recieve an email from the artist about wether your
                        commission has been accepted or rejected. Until then hold on
                        tight!
                    </p>
                </div>
            </div>
        )
    }

    // If the form has not been submitted then show the form
    return (
        <div key={renderKey} className="flex h-full w-full flex-col gap-4 rounded-xl p-5">
            <Button
                variant={'outline'}
                className="absolute"
                onMouseDown={() => setShowForm(false)}
            >
                <ArrowLeftCircleIcon className="h-6 w-6" />
                Back
            </Button>
            <div className="flex flex-col items-center justify-center gap-3">
                <NemuImage
                    src={'/nemu/fillout.png'}
                    alt="Nemu filling out form"
                    width={200}
                    height={200}
                />
                <h2 className="card-title">You're onto the next step!</h2>
                <p className="text-base-content/80">
                    We'll need you to fill out this form provided by the artist to get a
                    better understanding of your commission.
                </p>
                <div className="divider"></div>
            </div>
            {(form_data?.content as FormElementInstance[]).map((element) => {
                const FormComponent = FormElements[element.type].form_component

                return (
                    <FormComponent
                        key={element.id}
                        elementInstance={element}
                        submitValue={submitValue}
                        isInvalid={formErrors.current[element.id]}
                        defaultValue={formValues.current[element.id]}
                    />
                )
            })}
            <div className="divider"></div>
            <Button
                onMouseDown={() => startTransition(submitForm)}
                disabled={pending || user_requested}
            >
                {pending ? 'Submitting' : 'Submit'}
            </Button>
        </div>
    )
}
