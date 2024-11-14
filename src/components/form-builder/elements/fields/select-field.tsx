'use client'

import type {
    ElementsType,
    FormElement,
    FormElementInstance,
    SubmitFunction
} from '~/components/form-builder/elements/form-elements'

import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import * as z from 'zod'
import { useEffect, useState } from 'react'
import { useDesigner } from '~/components/form-builder/designer/designer-context'
import {
    DesignerCheckboxField,
    DesignerInputField
} from '~/components/form-builder/elements/input-field'
import { ListIcon, PlusCircleIcon, XCircleIcon } from 'lucide-react'
import { Select, SelectTrigger, SelectValue } from '~/components/ui/select'
import { cn } from '~/lib/utils'

const type: ElementsType = 'SelectField'

const extra_attributes = {
    label: 'Select Field',
    helperText: 'Helper Text',
    required: false,
    placeholder: 'Pick a value',
    options: []
}

const propertiesSchema = z.object({
    label: z.string().min(2).max(50),
    helperText: z.string().max(200),
    required: z.boolean().default(false),
    placeholder: z.string().max(50),
    options: z.array(z.string()).default([])
})

export const SelectFieldFormElement: FormElement = {
    type,

    construct: (id: string) => ({
        id,
        type,
        extra_attributes
    }),

    designer_btn_element: {
        icon: ListIcon,
        label: 'Select Field'
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
                <label className="text-sm text-base-content/80">Select Field</label>
                <h2 className="card-title">
                    {label}
                    {required && '*'}
                </h2>
                <Select disabled>
                    <SelectTrigger className="bg-base-300">
                        <SelectValue placeholder={placeholder} />
                    </SelectTrigger>
                </Select>
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
    const { label, required, placeholder, helperText, options } = element.extra_attributes

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
                {/* TODO: Figure Out Why Select Component isn't working */}
                {/* <Select onValueChange={(value) => setValue(value)} defaultValue={value}>
                    <SelectTrigger
                        className="bg-base-100"
                        
                    >
                        <SelectValue placeholder={placeholder} />
                    </SelectTrigger>
                    <SelectContent>
                        {options.map((option) => (
                            <SelectItem key={option} value={option}>
                                {option}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select> */}
                <select
                    className="select"
                    defaultValue={value}
                    onChange={(e) => setValue(e.currentTarget.value)}
                    onBlur={(e) => {
                        if (!submitValue) return

                        const valid = SelectFieldFormElement.validate(
                            element,
                            e.currentTarget.value
                        )
                        setError(!valid)
                        if (!valid) return

                        submitValue(element.id, e.currentTarget.value)
                    }}
                >
                    <option value="" disabled selected>
                        {placeholder}
                    </option>
                    {options.map((option) => (
                        <option key={option} value={option}>
                            {option}
                        </option>
                    ))}
                </select>
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
                    <div className="text-base-content/80">
                        This will be the placeholder of the field.
                    </div>
                }
                {...form.register('placeholder')}
            />
            <Controller
                name="options"
                control={form.control}
                render={({ field }) => (
                    <>
                        <div className="mb-5 flex flex-col gap-5">
                            <div className="flex items-center justify-between">
                                <label htmlFor="Options" className="block">
                                    Options:
                                </label>
                                <button
                                    type="button"
                                    className="btn btn-outline join-item"
                                    onMouseDown={(e) => {
                                        e.preventDefault()
                                        form.setValue(
                                            'options',
                                            form.getValues('options').concat('New Option')
                                        )
                                    }}
                                >
                                    <PlusCircleIcon className="h-6 w-6" />
                                    Add
                                </button>
                            </div>
                            {form.getValues('options') &&
                                form.watch('options').map((option, index) => (
                                    <div
                                        key={index}
                                        className="flex items-center justify-between gap-1"
                                    >
                                        <div className="join">
                                            <input
                                                className="input join-item w-full"
                                                placeholder="Add an option"
                                                value={option}
                                                onChange={(e) => {
                                                    field.value[index] =
                                                        e.currentTarget.value
                                                    field.onChange(field.value)
                                                }}
                                            />
                                            <button
                                                type="button"
                                                className="btn btn-ghost join-item bg-base-200"
                                                onMouseDown={(e) => {
                                                    e.preventDefault()

                                                    const newOptions = [...field.value]
                                                    newOptions.splice(index, 1)
                                                    field.onChange(newOptions)
                                                }}
                                            >
                                                <XCircleIcon className="h-6 w-6" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                        </div>
                        <p className="text-base-content/80">
                            <div className="text-base-content/80">
                                This will be the placeholder of the field.
                            </div>
                        </p>
                        <div className="divider"></div>
                    </>
                )}
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
                    <div className="text-base-content/80">
                        This will determine whether this is a required field.
                    </div>
                }
                {...form.register('required')}
            />
        </form>
    )
}
