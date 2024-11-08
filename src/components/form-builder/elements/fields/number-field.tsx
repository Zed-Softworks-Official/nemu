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
    DesignerInputField,
} from '~/components/form-builder/elements/input-field'

import { HashIcon } from 'lucide-react'
import { Input } from '~/components/ui/input'
import { cn } from '~/lib/utils'

const type: ElementsType = 'NumberField'

const extra_attributes = {
    label: 'Number Field',
    helperText: 'Helper Text',
    required: false,
    placeholder: '0'
}

const propertiesSchema = z.object({
    label: z.string().min(2).max(50),
    helperText: z.string().max(200),
    required: z.boolean().default(false),
    placeholder: z.string().max(50)
})

export const NumberFieldFormElement: FormElement = {
    type,

    construct: (id: string) => ({
        id,
        type,
        extra_attributes
    }),

    designer_btn_element: {
        icon: HashIcon,
        label: 'Number Field'
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
        <div className="card bg-base-100 shadow-xl w-full">
            <div className="card-body">
                <label className="text-sm text-base-content/80">Number Field</label>
                <h2 className="card-title">
                    {label}
                    {required && '*'}
                </h2>
                <Input type="number" readOnly disabled placeholder={placeholder} />
                {helperText && <p className="text-base-content/80">{helperText}</p>}
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
        <div className="card bg-base-300 w-full">
            <div className="card-body">
                <h2 className={cn(error && 'text-error', 'card-title')}>
                    {label}
                    {required && '*'}
                </h2>
                <Input
                    type="number"
                    placeholder={placeholder}
                    onChange={(e) => setValue(e.currentTarget.validationMessage)}
                    onBlur={(e) => {
                        if (!submitValue) return

                        const valid = NumberFieldFormElement.validate(
                            element,
                            e.currentTarget.value
                        )
                        setError(!valid)
                        if (!valid) return

                        submitValue(element.id, e.currentTarget.value)
                    }}
                    defaultValue={value}
                />

                {helperText && (
                    <p className={cn(error ? 'text-error/80' : 'text-base-content/80')}>
                        {helperText}
                    </p>
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
            className="flex flex-col w-full space-y-3"
        >
            <DesignerInputField
                label="Label"
                description={
                    <p className="text-base-content/80">
                        The label of the field. <br /> This will be displayed about the
                        field.
                    </p>
                }
                {...form.register('label')}
            />
            <DesignerInputField
                label="Placeholder"
                description={
                    <p className="text-base-content/80">
                        This will be the placeholder of the field.
                    </p>
                }
                {...form.register('placeholder')}
            />
            <DesignerInputField
                label="Helper Text"
                description={
                    <p className="text-base-content/80">
                        Add a bit more detail to the field. <br />
                        This will be displayed below the field.
                    </p>
                }
                {...form.register('helperText')}
            />
            <DesignerCheckboxField
                label="Required"
                type="checkbox"
                description={
                    <p className="text-base-content/80">
                        This will determine whether this is a required field.
                    </p>
                }
                {...form.register('required')}
            />
        </form>
    )
}
