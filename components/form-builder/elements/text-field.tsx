'use client'

import { DocumentTextIcon } from '@heroicons/react/20/solid'
import { ElementsType, FormElement, FormElementInstance } from './form-elements'
import TextInput from '@/components/form/text-input'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import * as z from 'zod'
import { useEffect } from 'react'
import { DesignerContextType, useDesigner } from '../designer/designer-context'
import { CheckboxField, InputField } from './input-field'

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
        icon: DocumentTextIcon,
        label: 'Text Field'
    },

    designer_component: DesignerComponent,
    form_component: () => <div>Form Component</div>,
    properties_component: PropertiesComponent
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
                <h2 className="card-title">
                    {label}
                    {required && '*'}
                </h2>
                <TextInput
                    label=""
                    labelDisabled
                    readOnly
                    disabled
                    placeholder={placeholder}
                />
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
    const { updateElement } = useDesigner() as DesignerContextType
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
        console.log(values)
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
                console.log('Test')
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
