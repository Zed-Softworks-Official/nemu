'use client'

import NemuImage from '@/components/nemu-image'

import { NemuResponse, StatusCode, StripeCustomerIdResponse } from '@/core/responses'
import { GraphQLFetcher } from '@/core/helpers'
import { useSession } from 'next-auth/react'
import useSWR from 'swr'
import { FormElementInstance, FormElements } from '../elements/form-elements'
import Loading from '@/components/loading'
import { useCallback, useRef, useState, useTransition } from 'react'
import { toast } from 'react-toastify'
import { CheckoutType, CommissionForm } from '@/core/structures'
import PaymentForm from '../../payments/payment-form'
import { CreateFormSubmissionStructure } from '@/core/data-structures/form-structures'

export default function CommissionFormSubmitView({ commission_id, form_id }: { commission_id: string; form_id: string }) {
    const { data: session } = useSession()
    const { data, isLoading } = useSWR(
        `{
            commission(id: "${commission_id}") {
                price
                artist {
                    handle
                    id
                    stripeAccount
                }
                get_form_content(user_id: "${session?.user.user_id}") {
                    user_submitted
                    content
                }
            }
        }`,
        GraphQLFetcher<{
            commission: {
                formId: string
                price: number
                artist: { stripeAccount: string; id: string; handle: string }
                get_form_content: CommissionForm
            }
        }>
    )

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
        const formElements = JSON.parse(data?.commission.get_form_content.content!) as FormElementInstance[]
        for (let key in formValues.current) {
            newFormData[key] = {
                value: formValues.current[key],
                label: formElements.find((element) => element.id == key)?.extra_attributes?.label
            }
        }

        // Create Customer If they don't exist
        const create_customer_response = await GraphQLFetcher<{
            check_create_customer: StripeCustomerIdResponse
        }>(
            `mutation {
                check_create_customer(user_id: "${session?.user.user_id}", artist_id:"${data?.commission.artist.id}") {
                    status
                    message
                }
            }`
        )

        if (create_customer_response.check_create_customer.status != StatusCode.Success) {
            toast(create_customer_response.check_create_customer.message, {
                theme: 'dark',
                type: 'error'
            })
            return
        }

        // Set submitted to true so the commission can either be sent
        // or the user can put in there payment information
        setSubmitted(true)

        // Check if we're using invoicing
        const JsonData: CreateFormSubmissionStructure = {
            user_id: session?.user.user_id!,
            form_id: form_id,
            content: JSON.stringify(newFormData)
        }

        const response = await fetch(`/api/forms/submission`, {
            method: 'post',
            body: JSON.stringify(JsonData)
        })

        const json = (await response.json()) as NemuResponse
        if (json.status != StatusCode.Success) {
            toast(json.message, { theme: 'dark', type: 'error' })
        }

        setFormData(newFormData)
    }

    const validateForm: () => boolean = useCallback(() => {
        for (const field of JSON.parse(data?.commission.get_form_content.content!) as FormElementInstance[]) {
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
    }, [data?.commission.get_form_content.content])

    if (isLoading) {
        return <Loading />
    }

    return (
        <>
            {!submitted ? (
                <div key={renderKey} className="flex flex-col w-full p-5 gap-4 bg-base-300 rounded-xl h-full max-w-xl mx-auto">
                    <div className="flex flex-col justify-center items-center gap-3">
                        <NemuImage src={'/nemu/fillout.png'} alt="Nemu filling out form" width={200} height={200} />
                        <h2 className="card-title">You're onto the next step!</h2>
                        <p className="text-base-content/80">
                            We'll need you to fill out this form provided by the artist to get a better understanding of your commission.
                        </p>
                        <div className="divider"></div>
                    </div>
                    {(JSON.parse(data?.commission.get_form_content.content!) as FormElementInstance[]).map((element) => {
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
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => startTransition(submitForm)}
                        disabled={pending || data?.commission.get_form_content.user_submitted || submitted}
                    >
                        {pending ? (
                            <>
                                <div className="loading loading-spinner"></div>
                                Loading
                            </>
                        ) : data?.commission.get_form_content.user_submitted ? (
                            <>Commission Already Submitted</>
                        ) : (
                            <>Next</>
                        )}
                    </button>
                </div>
            ) : (
                <div>
                    <div className="flex flex-col justify-center items-center gap-3">
                        <NemuImage src={'/nemu/sparkles.png'} alt="Nemu Excited" width={200} height={200} />
                        <h2 className="card-title">Things are happening!</h2>
                        <p className="text-base-content/80">
                            You'll recieve an email from the artist about wether your commission has been accepted or rejected. Until then hold on
                            tight!
                        </p>
                    </div>
                </div>
            )}
        </>
    )
}
