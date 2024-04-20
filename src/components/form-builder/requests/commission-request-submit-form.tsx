'use client'

import NemuImage from '@/components/nemu-image'

import { FormElementInstance, FormElements } from '~/components/form-builder/elements/form-elements'
import Loading from '@/components/loading'
import { useCallback, useRef, useState, useTransition } from 'react'
import { api } from '@/core/api/react'

export default function CommissionRequestSubmitView({
    commission_id,
    form_id
}: {
    commission_id: string
    form_id: string
}) {
    const { data, isLoading } = api.form.get_user_submitted.useQuery(form_id, {
        refetchOnMount: false,
        refetchOnReconnect: false,
        refetchOnWindowFocus: false
    })
    const mutation = api.form.set_request.useMutation({
        onSuccess: () => {
            toast('Request Submitted!', { theme: 'dark', type: 'success' })
        },
        onError: () => {
            setSubmitted(false)
            toast('Request could not be submitted!', { theme: 'dark', type: 'success' })
        }
    })

    const formValues = useRef<{ [key: string]: string }>({})
    const formErrors = useRef<{ [key: string]: boolean }>({})

    const [renderKey, setRenderKey] = useState(new Date().getTime())
    const [submitted, setSubmitted] = useState(false)
    const [formData, setFormData] = useState<{
        [key: string]: { value: string; label: string }
    }>({})

    const [pending, startTransition] = useTransition()

    const submitValue = useCallback((key: string, value: string) => {
        formErrors.current = {}
        formValues.current[key] = value
    }, [])

    async function submitForm() {
        const validForm = validateForm()
        if (!validForm) {
            setRenderKey(new Date().getTime())
            toast('Please check all required fields!', { theme: 'dark', type: 'error' })
            return
        }

        const newFormData: { [key: string]: { value: string; label: string } } = {}
        const formElements = JSON.parse(data?.content!) as FormElementInstance[]
        for (let key in formValues.current) {
            newFormData[key] = {
                value: formValues.current[key],
                label: formElements.find((element) => element.id == key)?.extra_attributes
                    ?.label
            }
        }

        // Set submitted to true so the commission can either be sent
        // or the user can put in there payment information
        setSubmitted(true)

        mutation.mutate({
            form_id,
            commission_id,
            content: JSON.stringify(newFormData)
        })

        setFormData(newFormData)
    }

    const validateForm: () => boolean = useCallback(() => {
        for (const field of JSON.parse(data?.content!) as FormElementInstance[]) {
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

    if (isLoading) {
        return <Loading />
    }

    return (
        <>
            {!submitted ? (
                <div
                    key={renderKey}
                    className="flex flex-col w-full p-5 gap-4 bg-base-300 rounded-xl h-full max-w-xl mx-auto"
                >
                    <div className="flex flex-col justify-center items-center gap-3">
                        <NemuImage
                            src={'/nemu/fillout.png'}
                            alt="Nemu filling out form"
                            width={200}
                            height={200}
                        />
                        <h2 className="card-title">You're onto the next step!</h2>
                        <p className="text-base-content/80">
                            We'll need you to fill out this form provided by the artist to
                            get a better understanding of your commission.
                        </p>
                        <div className="divider"></div>
                    </div>
                    {(JSON.parse(data?.content!) as FormElementInstance[]).map(
                        (element) => {
                            const FormComponent =
                                FormElements[element.type].form_component

                            return (
                                <FormComponent
                                    key={element.id}
                                    elementInstance={element}
                                    submitValue={submitValue}
                                    isInvalid={formErrors.current[element.id]}
                                    defaultValue={formValues.current[element.id]}
                                />
                            )
                        }
                    )}
                    <div className="divider"></div>
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => startTransition(submitForm)}
                        disabled={pending || data?.user_submitted || submitted}
                    >
                        {pending ? (
                            <>
                                <div className="loading loading-spinner"></div>
                                Loading
                            </>
                        ) : data?.user_submitted ? (
                            <>Commission Already Submitted</>
                        ) : (
                            <>Next</>
                        )}
                    </button>
                </div>
            ) : (
                <div>
                    <div className="flex flex-col justify-center items-center gap-3">
                        <NemuImage
                            src={'/nemu/sparkles.png'}
                            alt="Nemu Excited"
                            width={200}
                            height={200}
                        />
                        <h2 className="card-title">Things are happening!</h2>
                        <p className="text-base-content/80">
                            You'll recieve an email from the artist about wether your
                            commission has been accepted or rejected. Until then hold on
                            tight!
                        </p>
                    </div>
                </div>
            )}
        </>
    )
}
