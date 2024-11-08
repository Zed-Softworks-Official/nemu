'use client'

import type {
    ElementsType,
    FormElement,
    FormElementInstance,
    SubmitFunction
} from '~/components/form-builder/elements/form-elements'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import * as z from 'zod'
import { useEffect, useState } from 'react'
import { useDesigner } from '~/components/form-builder/designer/designer-context'
import {
    DesignerCheckboxField,
    DesignerInputField
} from '~/components/form-builder/elements/input-field'
import { RectangleEllipsisIcon } from 'lucide-react'
import { Input } from '~/components/ui/input'
import { cn } from '~/lib/utils'

const type: ElementsType = 'TextField'

const extra_attributes = {
    label: 'Text Field',
    helperText: 'Helper Text',
    required: false,
    placeholder: 'Value here...'
}

const propertiesSchema = z.object({
    label: z.string().min(2).max(50),
    helperText: z.string().max(200),
    required: z.boolean().default(false),
    placeholder: z.string().max(50)
})

export const TextFieldFormElement: FormElement = {
    type,

    construct: (id: string) => ({
        id,
        type,
        extra_attributes
    }),

    designer_btn_element: {
        icon: RectangleEllipsisIcon,
        label: 'Text Field'
    },

    designer_component: DesignerComponent,
    form_component: FormComponent,
    properties_component: PropertiesComponent,

    validate: (formElement: FormElementInstance, currentValue: string): boolean => {
        const element = formElement as CustomInstance
        if (element.extra_attributes.required) {
            return currentValue.length > 0
        }

        return true
    }
}

type CustomInstance = FormElementInstance & {
    extra_attributes: typeof extra_attributes
}

type PropertiesFormSchemaType = z.infer<typeof propertiesSchema>

function DesignerComponent({
    elementInstance
}: {
    elementInstance: FormElementInstance
}) {
    const element = elementInstance as CustomInstance
    const { label, required, placeholder, helperText } = element.extra_attributes

    return (
        <div className="card w-full bg-base-100 shadow-xl">
            <div className="card-body">
                <label className="text-sm text-base-content/80">Text Field</label>
                <h2 className="card-title">
                    {label}
                    {required && '*'}
                </h2>
                <Input disabled readOnly placeholder={placeholder} />
                {helperText && <div className="text-base-content/80">{helperText}</div>}
            </div>
        </div>
    )
}

function FormComponent({
    elementInstance,
    submitValue,
    isInvalid,
    defaultValue
}: {
    elementInstance: FormElementInstance
    submitValue?: SubmitFunction
    isInvalid?: boolean
    defaultValue?: string
}) {
    const element = elementInstance as CustomInstance
    const { label, required, placeholder, helperText } = element.extra_attributes

    const [value, setValue] = useState(defaultValue ?? '')
    const [error, setError] = useState(false)

    useEffect(() => {
        setError(isInvalid === true)
    }, [isInvalid])

    return (
        <div className="card w-full bg-base-300 shadow-xl">
            <div className="card-body">
                <h2 className={cn(error && 'text-error', 'card-title')}>
                    {label}
                    {required && '*'}
                </h2>
                <Input
                    placeholder={placeholder}
                    defaultValue={value}
                    onChange={(e) => setValue(e.target.validationMessage)}
                    onBlur={(e) => {
                        if (!submitValue) return

                        const valid = TextFieldFormElement.validate(
                            element,
                            e.currentTarget.value
                        )
                        setError(!valid)
                        if (!valid) return

                        submitValue(element.id, e.currentTarget.value)
                    }}
                />
                {helperText && (
                    <div className={cn(error ? 'text-error/80' : 'text-base-content/80')}>
                        {helperText}
                    </div>
                )}
            </div>
        </div>
    )
}

function PropertiesComponent({
    elementInstance
}: {
    elementInstance: FormElementInstance
}) {
    const element = elementInstance as CustomInstance
    const { updateElement } = useDesigner()
    const form = useForm<PropertiesFormSchemaType>({
        resolver: zodResolver(propertiesSchema),
        mode: 'onBlur',
        defaultValues: {
            label: element.extra_attributes.label,
            helperText: element.extra_attributes.helperText,
            required: element.extra_attributes.required,
            placeholder: element.extra_attributes.placeholder
        }
    })

    useEffect(() => {
        form.reset(element.extra_attributes)
    }, [element, form])

    function applyChanges(values: PropertiesFormSchemaType) {
        updateElement(element.id, {
            ...element,
            extra_attributes: {
                ...values
            }
        })
    }

    return (
        <form
            onBlur={form.handleSubmit(applyChanges)}
            onSubmit={(e) => {
                e.preventDefault()
            }}
            className="flex w-full flex-col space-y-3"
        >
            <DesignerInputField
                label="Label"
                description={
                    <div className="text-base-content/80">
                        The label of the field. <br /> This will be displayed about the
                        field.
                    </div>
                }
                {...form.register('label')}
            />
            <DesignerInputField
                label="Placeholder"
                description={
                    <div className="text-base-content/80">
                        This will be the placeholder of the field.
                    </div>
                }
                {...form.register('placeholder')}
            />
            <DesignerInputField
                label="Helper Text"
                description={
                    <div className="text-base-content/80">
                        Add a bit more detail to the field. <br />
                        This will be displayed below the field.
                    </div>
                }
                {...form.register('helperText')}
            />
            <DesignerCheckboxField
                label="Required"
                type="checkbox"
                description={
                    <div className="text-base-content/80">
                        This will determine whether this is a required field.
                    </div>
                }
                {...form.register('required')}
            />
        </form>
    )
}
