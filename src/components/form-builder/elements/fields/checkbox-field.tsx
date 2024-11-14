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
import { SquareCheckIcon } from 'lucide-react'
import { Switch } from '~/components/ui/switch'

const type: ElementsType = 'CheckboxField'

const extra_attributes = {
    label: 'Checkbox Field',
    helperText: 'Helper Text',
    required: false
}

const propertiesSchema = z.object({
    label: z.string().min(2).max(50),
    helperText: z.string().max(200),
    required: z.boolean().default(false)
})

export const CheckboxFieldFormElement: FormElement = {
    type,

    construct: (id: string) => ({
        id,
        type,
        extra_attributes
    }),

    designer_btn_element: {
        icon: SquareCheckIcon,
        label: 'Checkbox Field'
    },

    designer_component: DesignerComponent,
    form_component: FormComponent,
    properties_component: PropertiesComponent,

    validate: (formElement: FormElementInstance, currentValue: string): boolean => {
        const element = formElement as CustomInstance
        if (element.extra_attributes.required) {
            return currentValue !== 'true'
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
    const { label, required, helperText } = element.extra_attributes
    const id = `checkbox-${element.id}`

    return (
        <div className="card bg-base-100 shadow-xl w-full">
            <div className="card-body">
                <label className="text-sm text-base-content/80" htmlFor={id}>
                    Checkbox Field
                </label>
                <div className="form-control">
                    <label htmlFor={id} className="label text-xl cursor-pointer">
                        <span className="label-text">
                            {label}
                            {required && '*'}:
                        </span>
                        <input
                            type={type}
                            className="toggle toggle-primary"
                            disabled
                            readOnly
                        />
                    </label>
                </div>
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
    const { label, required, helperText } = element.extra_attributes

    const [, setValue] = useState<boolean>(defaultValue === 'true' ? true : false)
    const [, setError] = useState(false)

    useEffect(() => {
        setError(isInvalid === true)
    }, [isInvalid])

    const id = `checkbox-${element.id}`

    return (
        <div className="card bg-base-300 shadow-xl w-full">
            <div className="card-body">
                <div className="form-control">
                    <label htmlFor={id} className="label text-xl cursor-pointer">
                        <span className="label-text">
                            {label}
                            {required && '*'}:
                        </span>
                        <Switch
                            onChange={(e) => {
                                let value = false
                                if (e.currentTarget.value === 'true') value = true

                                setValue(value)
                                if (!submitValue) return

                                const stringValue = value ? 'true' : 'false'
                                const valid = CheckboxFieldFormElement.validate(
                                    element,
                                    stringValue
                                )

                                setError(!valid)
                                submitValue(element.id, stringValue)
                            }}
                        />
                    </label>
                </div>
                {helperText && <p className="text-base-content/80">{helperText}</p>}
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
            required: element.extra_attributes.required
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
