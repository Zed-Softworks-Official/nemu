'use client'

import { LuHeading1 } from 'react-icons/lu'
import {
    ElementsType,
    FormElement,
    FormElementInstance,
} from '../form-elements'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import * as z from 'zod'
import { useEffect, useState } from 'react'
import { DesignerContextType, useDesigner } from '../../designer/designer-context'
import { DesignerInputField } from '../input-field'

const type: ElementsType = 'TitleField'

const extra_attributes = {
    title: 'Title Field'
}

const propertiesSchema = z.object({
    title: z.string().min(2).max(50)
})

export const TitleFieldFormElement: FormElement = {
    type,

    construct: (id: string) => ({
        id,
        type,
        extra_attributes
    }),

    designer_btn_element: {
        icon: LuHeading1,
        label: 'Title'
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
    const { title } = element.extra_attributes

    return (
        <div className="card bg-base-100 shadow-xl w-full">
            <div className="card-body">
                <label className="text-sm text-base-content/80">Title Field</label>
                <h2 className="card-title">{title}</h2>
            </div>
        </div>
    )
}

function FormComponent({ elementInstance }: { elementInstance: FormElementInstance }) {
    const element = elementInstance as CustomInstance
    const { title } = element.extra_attributes

    return (
        <div className="card bg-base-300 w-full">
            <div className="card-body">
                <div className="divider card-title text-3xl">{title}</div>
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
            title: element.extra_attributes.title
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
                label="Title"
                description={
                    <p className="text-base-content/80">
                        This will create a new section with the given title.
                    </p>
                }
                {...form.register('title')}
            />
        </form>
    )
}
