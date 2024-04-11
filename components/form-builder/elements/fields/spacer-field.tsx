'use client'

import { ElementsType, FormElement, FormElementInstance } from '../form-elements'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import * as z from 'zod'
import { useEffect } from 'react'
import { DesignerContextType, useDesigner } from '../../designer/designer-context'
import { DesignerRangeField } from '../input-field'
import { UnfoldHorizontalIcon } from 'lucide-react'

const type: ElementsType = 'SpacerField'

const extra_attributes = {
    height: 20
}

const propertiesSchema = z.object({
    height: z.number().min(0).max(100)
})

export const SpacerFieldFormElement: FormElement = {
    type,

    construct: (id: string) => ({
        id,
        type,
        extra_attributes
    }),

    designer_btn_element: {
        icon: UnfoldHorizontalIcon,
        label: 'Spacer'
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
    const { height } = element.extra_attributes

    return (
        <div className="card bg-base-100 shadow-xl w-full">
            <div className="card-body justify-center items-center">
                <label className="text-sm text-base-content/80">
                    Spacer field: {height}px
                </label>
                <UnfoldHorizontalIcon className='w-8 h-8' />
            </div>
        </div>
    )
}

function FormComponent({ elementInstance }: { elementInstance: FormElementInstance }) {
    const element = elementInstance as CustomInstance
    const { height } = element.extra_attributes

    return (
        <div className="card bg-base-300 w-full">
            <div className="card-body">
                <div style={{ height, width: '100%' }}></div>
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
            height: element.extra_attributes.height
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
            <DesignerRangeField
                label={`Spacer (${form.watch('height')}px)`}
                min={0}
                max={100}
                step={1}
                description={
                    <p className="text-base-content/80">
                        Creates a gap in the form with the desired amount (in pixels)
                    </p>
                }
                {...form.register('height', { valueAsNumber: true })}
            />
        </form>
    )
}
