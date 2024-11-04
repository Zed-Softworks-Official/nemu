'use client'

import { ArrowLeftCircleIcon } from 'lucide-react'
import { useCallback, useRef, useState, useTransition } from 'react'

import NemuImage from '~/components/nemu-image'

import {
    type FormElementInstance,
    FormElements
} from '~/components/form-builder/elements/form-elements'

import { Button } from '~/components/ui/button'
import { toast } from 'sonner'
import type { InferSelectModel } from 'drizzle-orm'

import type { forms } from '~/server/db/schema'
import { set_request } from '~/server/actions/requests'

interface FormDataType {
    value: string
    label: string
}

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
    // Form values and errors
    const formValues = useRef<Record<string, string>>({})
    const formErrors = useRef<Record<string, boolean>>({})

    // Key to re-render the form and submitted state and user form data
    const [renderKey, setRenderKey] = useState(new Date().getTime())
    const [submitted, setSubmitted] = useState(false)
    const [, setFormData] = useState<Record<string, FormDataType>>({})

    const [, startTransition] = useTransition()
    const [pending, setPending] = useState(false)

    // Submit a value to the form
    const submitValue = useCallback((key: string, value: string) => {
        formErrors.current = {}
        formValues.current[key] = value
    }, [])

    // Handles the form submission to the server
    async function submitForm() {
        setPending(true)
        const toast_id = toast.loading('Submitting Commission Request')

        const validForm = validateForm()
        if (!validForm) {
            setPending(false)
            setRenderKey(new Date().getTime())
            toast.error('Please check all required fields!')

            return
        }

        const newFormData: Record<string, FormDataType> = {}
        const formElements = form_data?.content as FormElementInstance[]
        for (const key in formValues.current) {
            newFormData[key] = {
                value: formValues.current[key]!,
                label: (
                    formElements.find((element) => element.id == key)
                        ?.extra_attributes as FormDataType
                ).label
            }
        }

        const res = await set_request(
            form_data.id,
            commission_id,
            JSON.stringify(newFormData)
        )

        if (!res.success) {
            toast.error('Commission request could not be submitted!', {
                id: toast_id
            })

            setPending(false)
            setFormData(newFormData)

            return
        }

        toast.success('Commission Request Submitted!', {
            id: toast_id
        })

        setSubmitted(true)
    }

    // Validate the form
    const validateForm: () => boolean = useCallback(() => {
        for (const field of form_data?.content as FormElementInstance[]) {
            const actualValue = formValues.current[field.id] ?? ''
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
                        You&apos;ll recieve an email from the artist about wether your
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
                <h2 className="card-title">You&apos;re onto the next step!</h2>
                <p className="text-base-content/80">
                    We&apos;ll need you to fill out this form provided by the artist to
                    get a better understanding of your commission.
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
