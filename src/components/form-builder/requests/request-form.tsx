'use client'

import { useTheme } from 'next-themes'
import { ArrowLeftCircleIcon } from 'lucide-react'
import { useCallback, useRef, useState, useTransition } from 'react'

import NemuImage from '~/components/nemu-image'

import {
    FormElementInstance,
    FormElements
} from '~/components/form-builder/elements/form-elements'

import Loading from '~/components/ui/loading'
import { api } from '~/trpc/react'
import { nemu_toast } from '~/lib/utils'
import { Button } from '~/components/ui/button'

export default function RequestSubmitForm({
    commission_id,
    form_id,
    setShowForm
}: {
    commission_id: string
    form_id: string
    setShowForm: (show: boolean) => void
}) {
    const { resolvedTheme } = useTheme()

    // Fetch the form data
    const { data, isLoading } = api.form.get_form.useQuery(form_id, {
        refetchOnMount: false,
        refetchOnReconnect: false,
        refetchOnWindowFocus: false
    })

    // Fetch the requested users
    const { data: userRequested, isLoading: requestedLoading } =
        api.requests.get_user_requsted.useQuery(form_id, {
            refetchOnMount: false,
            refetchOnReconnect: false,
            refetchOnWindowFocus: false
        })

    // Mutation to submit the form
    const mutation = api.requests.set_request.useMutation({
        onSuccess: () => {
            nemu_toast('Commission Request Submitted!', {
                theme: resolvedTheme,
                type: 'success'
            })

            setSubmitted(true)
        },
        onError: () => {
            nemu_toast('Commission request could not be submitted!', {
                theme: resolvedTheme,
                type: 'error'
            })
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
            nemu_toast('Please check all required fields!', {
                theme: resolvedTheme,
                type: 'error'
            })

            return
        }

        const newFormData: { [key: string]: { value: string; label: string } } = {}
        const formElements = data?.content as FormElementInstance[]
        for (let key in formValues.current) {
            newFormData[key] = {
                value: formValues.current[key]!,
                label: formElements.find((element) => element.id == key)?.extra_attributes
                    ?.label
            }
        }

        mutation.mutate({
            form_id,
            commission_id,
            content: JSON.stringify(newFormData)
        })

        setFormData(newFormData)
    }

    // Validate the form
    const validateForm: () => boolean = useCallback(() => {
        for (const field of data?.content as FormElementInstance[]) {
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
    }, [data?.content])

    // Loading state for client side
    if (isLoading || requestedLoading) {
        return (
            <div className="flex justify-center items-center h-full">
                <Loading />
            </div>
        )
    }

    // If the form has been submitted then show the success message
    if (submitted) {
        return (
            <div className="max-w-xl mx-auto h-full">
                <div className="flex flex-col gap-5 items-center justify-center p-5 h-full w-full text-center">
                    <NemuImage
                        src={'/nemu/sparkles.png'}
                        alt="Nemu Excited"
                        width={200}
                        height={200}
                        priority
                    />

                    <h2 className="text-2xl font-bold">Things are happening!</h2>
                    <p className="text-base-content/80 italic">
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
        <div key={renderKey} className="flex flex-col w-full p-5 gap-4 rounded-xl h-full">
            <Button
                variant={'outline'}
                className="absolute"
                onMouseDown={() => setShowForm(false)}
            >
                <ArrowLeftCircleIcon className="w-6 h-6" />
                Back
            </Button>
            <div className="flex flex-col justify-center items-center gap-3">
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
            {(data?.content as FormElementInstance[]).map((element) => {
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
                disabled={pending || userRequested}
            >
                {pending ? 'Submitting' : 'Submit'}
            </Button>
        </div>
    )
}
