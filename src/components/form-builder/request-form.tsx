'use client'

import { useCallback, useRef, type Dispatch, type SetStateAction } from 'react'
import { type InferSelectModel } from 'drizzle-orm'
import { ArrowLeftCircle } from 'lucide-react'

import { type forms } from '~/server/db/schema'

import { Button } from '~/components/ui/button'
import NemuImage from '~/components/nemu-image'
import { Separator } from '~/components/ui/separator'
import {
    type FormElementInstance,
    FormElements
} from '~/components/form-builder/elements/form-elements'
import { toast } from 'sonner'
import { api } from '~/trpc/react'

export function RequestForm(props: {
    commission_id: string
    set_show_form: Dispatch<SetStateAction<boolean>>
    form_data: InferSelectModel<typeof forms>
    user_requested: boolean | undefined
}) {
    const submit_request = api.request.setRequest.useMutation({
        onMutate: () => {
            const toast_id = toast.loading('Submitting Request')

            return { toast_id }
        },
        onSuccess: (_, __, { toast_id }) => {
            toast.success('Request Submitted', {
                id: toast_id
            })
        },
        onError: (error, _, context) => {
            if (context?.toast_id) {
                return
            }

            toast.error(error.message, {
                id: context?.toast_id
            })
        }
    })

    const form_values = useRef<Record<string, string>>({})
    const form_errors = useRef<Record<string, boolean>>({})

    const validate_form = useCallback((form_elements: FormElementInstance[]) => {
        for (const field of form_elements) {
            const valid = FormElements[field.type].validate(
                field,
                form_values.current[field.id] ?? ''
            )

            if (!valid) {
                form_errors.current[field.id] = true
            }
        }

        if (Object.keys(form_errors.current).length !== 0) {
            return false
        }

        return true
    }, [])

    const submit_value = useCallback((key: string, value: string) => {
        form_values.current[key] = value
    }, [])

    const handle_submit = () => {
        if (!props.form_data?.content) {
            toast.error('Form data not found')
            return
        }

        form_errors.current = {}
        const valid_form = validate_form(props.form_data?.content)

        if (!valid_form) {
            toast.error('Please fill out all required fields')
            return
        }

        // Create a mapping of form field IDs to their labels
        const form_data = props.form_data?.content
        const labeled_form_values = Object.entries(form_values.current).reduce(
            (acc, [id, value]) => {
                const field = form_data.find((element) => element.id === id)
                return {
                    ...acc,
                    [(field?.metadata?.label as string) ?? id]: value
                }
            },
            {}
        )

        submit_request.mutate({
            commission_id: props.commission_id,
            form_data: JSON.stringify(labeled_form_values)
        })
    }

    if (submit_request.isSuccess) {
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
                    <p className="text-muted-foreground italic">
                        You&apos;ll receive a notification from the artist about wether
                        your commission has been accepted or rejected. Until then, hold on
                        tight!
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className="flex h-full w-full flex-col gap-4 rounded-xl p-5">
            <div>
                <Button variant={'outline'} onClick={() => props.set_show_form(false)}>
                    <ArrowLeftCircle className="h-6 w-6" />
                    Back
                </Button>
            </div>
            <div className="flex flex-col items-center justify-center gap-3">
                <NemuImage
                    src={'/nemu/fillout.png'}
                    alt="Nemu filling out form"
                    width={200}
                    height={200}
                />
                <h2 className="text-xl font-bold">You&apos;re onto the next step!</h2>
                <p className="text-muted-foreground text-lg">
                    We&apos;ll need you to fill out this form provided by the artist to
                    get a better understanding of your commission.
                </p>
                <Separator />
            </div>
            {(props.form_data?.content ?? []).map((element) => {
                const FormComponent = FormElements[element.type].form_component

                return (
                    <FormComponent
                        key={element.id}
                        element_instance={element}
                        submit_value={submit_value}
                        is_invalid={form_errors.current[element.id]}
                        default_value={form_values.current[element.id]}
                    />
                )
            })}
            <Separator />
            <Button
                type="button"
                onClick={handle_submit}
                disabled={submit_request.isPending || submit_request.isSuccess}
            >
                Submit
            </Button>
        </div>
    )
}
