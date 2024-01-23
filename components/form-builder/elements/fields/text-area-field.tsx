'use client'

import { BsTextareaResize } from 'react-icons/bs'
import {
    ElementsType,
    FormElement,
    FormElementInstance,
    SubmitFunction
} from '../form-elements'
import TextInput from '@/components/form/text-input'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import * as z from 'zod'
import { useEffect, useState } from 'react'
import { DesignerContextType, useDesigner } from '../../designer/designer-context'
import { CheckboxField, InputField, RangeField, TextAreaField } from '../input-field'
import classNames from '@/core/helpers'
import TextArea from '@/components/form/text-area'
import TextAreaInput from '@/components/form/text-area'

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
        icon: BsTextareaResize,
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
        <div className="card bg-base-100 shadow-xl w-full">
            <div className="card-body">
                <label className="text-sm text-base-content/80">Text Area Field</label>
                <h2 className="card-title">
                    {label}
                    {required && '*'}
                </h2>
                <TextAreaInput
                    label=""
                    labelDisabled
                    rows={rows}
                    addClasses='bg-base-300'
                    placeholder={placeholder}
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

    const [value, setValue] = useState(defaultValue || '')
    const [error, setError] = useState(false)

    useEffect(() => {
        setError(isInvalid === true)
    }, [isInvalid])

    return (
        <div className="card bg-base-300 w-full">
            <div className="card-body">
                <h2 className={classNames(error && 'text-error', 'card-title')}>
                    {label}
                    {required && '*'}
                </h2>
                <TextAreaInput
                    label=""
                    labelDisabled
                    rows={rows}
                    error={error}
                    placeholder={placeholder}
                    onChange={(e) => setValue(e.target.validationMessage)}
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
                    <p
                        className={classNames(
                            error ? 'text-error/80' : 'text-base-content/80'
                        )}
                    >
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
    const { updateElement } = useDesigner() as DesignerContextType
    const form = useForm<PropertiesFormSchemaType>({
        resolver: zodResolver(propertiesSchema),
        mode: 'onBlur',
        defaultValues: {
            label: element.extra_attributes.label,
            helperText: element.extra_attributes.helperText,
            required: element.extra_attributes.required,
            placeholder: element.extra_attributes.placeholder,
            rows: element.extra_attributes.rows
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
            <InputField
                label="Label"
                description={
                    <p className="text-base-content/80">
                        The label of the field. <br /> This will be displayed about the
                        field.
                    </p>
                }
                {...form.register('label')}
            />
            <InputField
                label="Placeholder"
                description={
                    <p className="text-base-content/80">
                        This will be the placeholder of the field.
                    </p>
                }
                {...form.register('placeholder')}
            />
            <InputField
                label="Helper Text"
                description={
                    <p className="text-base-content/80">
                        Add a bit more detail to the field. <br />
                        This will be displayed below the field.
                    </p>
                }
                {...form.register('helperText')}
            />
            <RangeField
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
            <CheckboxField
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