'use client'

import NemuImage from '@/components/nemu-image'
import { CommissionFormsResponse, NemuResponse, StatusCode } from '@/core/responses'
import { Fetcher, GraphQLFetcher } from '@/core/helpers'
import { useSession } from 'next-auth/react'
import useSWR from 'swr'
import { FormElementInstance, FormElements } from '../elements/form-elements'
import Loading from '@/components/loading'
import { useCallback, useRef, useState, useTransition } from 'react'
import { toast } from 'react-toastify'
import { CreateToastPromise } from '@/core/promise'
import { CommissionForm } from '@/core/structures'

export default function CommissionFormSubmitView({
    handle,
    form_id
}: {
    handle: string
    form_id: string
}) {
    const { data: session } = useSession()
    const { data, isLoading } = useSWR(
        `{
            artist(handle: "${handle}") {
                get_form(form_id: "${form_id}") {
                    content
                }
            }
        }`,
        GraphQLFetcher<{ artist: { get_form: CommissionForm } }>
    )

    // const { data: userSubmitted, isLoading: userSubmittedLoading } = useSWR<NemuResponse>(
    //     `/api/artist/${artist}/forms/${form_id}/submissions/${session?.user.user_id}`,
    //     Fetcher
    // )

    const formValues = useRef<{ [key: string]: string }>({})
    const formErrors = useRef<{ [key: string]: boolean }>({})

    const [renderKey, setRenderKey] = useState(new Date().getTime())
    const [submitted, setSubmitted] = useState(false)

    const [pending, startTransition] = useTransition()

    const submitValue = useCallback((key: string, value: string) => {
        formErrors.current = {}
        formValues.current[key] = value
    }, [])

    async function submitForm() {
        // const validForm = validateForm()
        // if (!validForm) {
        //     setRenderKey(new Date().getTime())
        //     toast('Please check all required fields!', { theme: 'dark', type: 'error' })
        //     return
        // }
        // setSubmitted(true)
        // // Set User Id
        // formValues.current['user_id'] = session?.user.user_id!
        // await CreateToastPromise(
        //     fetch(`/api/artist/${session?.user.user_id}/forms/${data?.form?.id}/submit`, {
        //         method: 'post',
        //         body: JSON.stringify(formValues.current)
        //     }),
        //     { pending: 'Submitting your form', success: 'Form Submitted!' }
        // )
    }

    // const validateForm: () => boolean = useCallback(() => {
    //     for (const field of data?.artist.get_form.content) {
    //         const actualValue = formValues.current[field.id] || ''
    //         const valid = FormElements[field.type].validate(field, actualValue)

    //         if (!valid) {
    //             formErrors.current[field.id] = true
    //         }
    //     }

    //     if (Object.keys(formErrors.current).length > 0) {
    //         return false
    //     }

    //     return true
    // }, [data?.artist.get_form.content])

    if (isLoading) {
        //|| userSubmittedLoading) {
        return <Loading />
    }

    return (
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
                <h2 className="card-title">You're almost there!</h2>
                <p className="text-base-content/80">
                    You just need to fill out this form provided by the artist to get a
                    better understanding of your commission.
                </p>
                <div className="divider"></div>
            </div>
            {data?.artist.get_form.content}
            {/* {(JSON.parse(data?.artist.get_form.content!) as FormElementInstance[]).map(
                (element) => {
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
                }
            )} */}
            <div className="divider"></div>
            <button
                type="button"
                className="btn btn-primary"
                onClick={() => startTransition(submitForm)}
                //disabled={pending || userSubmitted?.status != StatusCode.Success}
            >
                {/* {pending ? (
                    <>
                        <div className="loading loading-spinner"></div>
                        Loading
                    </>
                ) : userSubmitted?.status != StatusCode.Success ? (
                    <>{userSubmitted?.message}</>
                ) : (
                    <>Submit</>
                )} */}
                Submit
            </button>
        </div>
    )
}
