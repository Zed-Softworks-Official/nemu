'use client'

import { ElementsType, FormElement, FormElementInstance } from '../form-elements'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import * as z from 'zod'
import { useEffect } from 'react'
import { DesignerContextType, useDesigner } from '../../designer/designer-context'
import { DesignerTextAreaField } from '../input-field'
import { PilcrowIcon } from 'lucide-react'

const type: ElementsType = 'ParagraphField'

const extra_attributes = {
    text: 'Paragraph Field'
}

const propertiesSchema = z.object({
    text: z.string().min(2).max(500)
})

export const ParagraphFieldFormElement: FormElement = {
    type,

    construct: (id: string) => ({
        id,
        type,
        extra_attributes
    }),

    designer_btn_element: {
        icon: PilcrowIcon,
        label: 'Paragraph'
    },

    designer_component: DesignerComponent,
    form_component: FormComponent,
    properties_component: PropertiesComponent,

    validate: () => true
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
    const { text } = element.extra_attributes

    return (
        <div className="card bg-base-100 shadow-xl w-full">
            <div className="card-body">
                <label className="text-sm text-base-content/80">Paragraph Field</label>
                <h2 className="card-title">{text}</h2>
            </div>
        </div>
    )
}

function FormComponent({ elementInstance }: { elementInstance: FormElementInstance }) {
    const element = elementInstance as CustomInstance
    const { text } = element.extra_attributes

    return (
        <div className="card w-full -mt-14">
            <div className="card-body w-full">
                <p className="text-base-content">{text}</p>
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
            text: element.extra_attributes.text
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
            <DesignerTextAreaField
                label="Text"
                description={
                    <p className="text-base-content/80">
                        Create a paragraph to determine what you need from the commissioner!
                    </p>
                }
                {...form.register('text')}
            />
        </form>
    )
}
