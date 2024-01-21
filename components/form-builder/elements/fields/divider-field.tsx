'use client'

import { RiSeparator } from 'react-icons/ri'
import { ElementsType, FormElement, FormElementInstance } from '../form-elements'

const type: ElementsType = 'DividerField'

export const DividerFieldFormElement: FormElement = {
    type,

    construct: (id: string) => ({
        id,
        type
    }),

    designer_btn_element: {
        icon: RiSeparator,
        label: 'Divider'
    },

    designer_component: DesignerComponent,
    form_component: FormComponent,
    properties_component: PropertiesComponent,

    validate: () => true
}

function DesignerComponent({
    elementInstance
}: {
    elementInstance: FormElementInstance
}) {
    return (
        <div className="card bg-base-100 shadow-xl w-full">
            <div className="card-body">
                <label className="text-sm text-base-content/80">Divider</label>
            </div>
        </div>
    )
}

function FormComponent({ elementInstance }: { elementInstance: FormElementInstance }) {
    return (
        <div className="card w-full">
            <div className="card-body w-full">
                <div className="divider"></div>
            </div>
        </div>
    )
}

function PropertiesComponent({
    elementInstance
}: {
    elementInstance: FormElementInstance
}) {
    return <p>No Properties for this element</p>
}
