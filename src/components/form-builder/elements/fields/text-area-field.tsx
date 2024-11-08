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
    DesignerRangeField
} from '~/components/form-builder/elements/input-field'
import { ScalingIcon } from 'lucide-react'
import { Textarea } from '~/components/ui/textarea'
import { cn } from '~/lib/utils'

const type: ElementsType = 'TextAreaField'

const extra_attributes = {
    label: 'Text Area',
    helperText: 'Helper Text',
    required: false,
    placeholder: 'Value here...',
    row: 3
}

const propertiesSchema = z.object({
    label: z.string().min(2).max(50),
    helperText: z.string().max(200),
    required: z.boolean().default(false),
    placeholder: z.string().max(50),
    rows: z.number().min(1).max(10)
})

export const TextAreaFieldFormElement: FormElement = {
    type,

    construct: (id: string) => ({
        id,
        type,
        extra_attributes
    }),

    designer_btn_element: {
        icon: ScalingIcon,
        label: 'Text Area Field'
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
    const { label, required, placeholder, helperText, rows } = element.extra_attributes

    return (
        <div className="card w-full bg-base-100 shadow-xl">
            <div className="card-body">
                <label className="text-sm text-base-content/80">Text Area Field</label>
                <h2 className="card-title">
                    {label}
                    {required && '*'}
                </h2>
                <Textarea
                    placeholder={placeholder}
                    rows={(rows as number) ?? 6}
                    className="resize-none bg-base-300"
                    disabled
                />
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
    const { label, required, placeholder, helperText, rows } = element.extra_attributes

    const [value, setValue] = useState(defaultValue ?? '')
    const [error, setError] = useState(false)

    useEffect(() => {
        setError(isInvalid === true)
    }, [isInvalid])

    return (
        <div className="card w-full bg-base-300">
            <div className="card-body">
                <h2 className={cn(error && 'text-error', 'card-title')}>
                    {label}
                    {required && '*'}
                </h2>
                <Textarea
                    className="resize-none"
                    rows={(rows as number) ?? 6}
                    placeholder={placeholder}
                    onChange={(e) => setValue(e.currentTarget.validationMessage)}
                    onBlur={(e) => {
                        if (!submitValue) return

                        const valid = TextAreaFieldFormElement.validate(
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
            placeholder: element.extra_attributes.placeholder,
            rows: element.extra_attributes.rows as number
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
                    <div className="text-base-content/80">
                        Add a bit more detail to the field. <br />
                        This will be displayed below the field.
                    </div>
                }
                {...form.register('helperText')}
            />
            <DesignerRangeField
                label={`Rows (${form.watch('rows')})`}
                min={1}
                max={10}
                step={1}
                description={
                    <p className="text-base-content/80">
                        Change the height of the text area.
                    </p>
                }
                {...form.register('rows', { valueAsNumber: true })}
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
